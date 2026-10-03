import { Router } from "../lib/http";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { ok, rateLimit } from "../lib/api";
import { productSearchSchema, searchProducts } from "./products";
import { db } from "../db";
import { orders } from "../schema";
import {
  answerFromKnowledge,
  buildSystemPrompt,
  DEFAULT_SUGGESTIONS,
  deriveProductQuery,
  isProductSeeking,
} from "../lib/chatbot-knowledge";

export const chatRoute = new Router();

/* --------------------------------- config ---------------------------------- */

/**
 * Any OpenAI-compatible chat-completions endpoint works here.
 * Defaults target Groq (fast + free tier): set CHATBOT_API_KEY to enable AI answers.
 * Without a key the route serves the built-in knowledge base instead.
 */
const CHATBOT_API_KEY = process.env.CHATBOT_API_KEY ?? process.env.GROQ_API_KEY ?? "";
const CHATBOT_BASE_URL = (process.env.CHATBOT_BASE_URL ?? "https://api.groq.com/openai/v1").replace(
  /\/$/,
  "",
);
const CHATBOT_MODEL = process.env.CHATBOT_MODEL ?? "llama-3.3-70b-versatile";
const AI_TIMEOUT_MS = 12_000;

/* --------------------------------- schemas --------------------------------- */

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
});

export type ChatSource = "ai" | "assistant";

chatRoute.use("/", rateLimit(30, 60_000));

/**
 * True when the question is about the caller's own orders/rentals rather than
 * the marketplace at large. Matched on verbs + nouns; deliberately narrow, so a
 * "what is a security deposit?" question still goes to the knowledge base.
 */
function isOrderStatusQuestion(text: string): boolean {
  const mentionsOrder = /\b(order|orders|rental|rentals|delivery|delivered|shipment|shipped)\b/i;
  const asksAboutOwn = /\b(my|mine|latest|last|current|active|where)\b/i;
  const smalltalk = /\b(what is|what's|how do|how does|explain|meaning of)\b/i;
  return mentionsOrder.test(text) && asksAboutOwn.test(text) && !smalltalk.test(text);
}

/**
 * Answer an order-status question from the *session user's* real orders.
 *
 * Returns null for a guest — the honest answer is "sign in", never a fabricated
 * order. Only the caller's own rows are ever read, and only safe fields leave:
 * the public order number, status and a date. No address, no money beyond the
 * total, nothing that another user could be probed for.
 */
async function answerOwnOrderQuestion(
  userId: number | undefined,
): Promise<{ reply: string; suggestions: string[] } | null> {
  if (!userId) {
    return {
      reply:
        "Sign in and I can tell you exactly where your orders and rentals stand — I look them up from your account, not guesses.",
      suggestions: ["How do I sign in?", "How does renting work?"],
    };
  }

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      orderType: orders.orderType,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.updatedAt), desc(orders.id))
    .limit(1);

  const latest = rows[0];
  if (!latest) {
    return {
      reply:
        "You don't have any orders yet. Browse the marketplace and your orders will show up here once you make one.",
      suggestions: ["Find something to rent", "What is a security deposit?"],
    };
  }

  const ref = latest.orderNumber ?? `#${latest.createdAt.getFullYear()}`;
  const status = latest.status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    reply: `Your most recent order ${latest.orderNumber ?? ref} is “${status}”. You can see the full timeline on your orders page — tap a card in My Orders for every step.`,
    suggestions: [
      "Where is my latest order?",
      "How do I cancel an order?",
      "What is a security deposit?",
    ],
  };
}

chatRoute.post("/", async (c) => {
  const { messages } = chatSchema.parse(await c.req.json());
  const latest = [...messages].reverse().find((m) => m.role === "user")!;
  const text = latest.content;

  // Authenticated users asking about *their* orders get real data, before any
  // product lookup: the answer comes from the session user's rows, never from
  // the model's imagination.
  if (isOrderStatusQuestion(text)) {
    const user = c.get("user") ?? null;
    const orderAnswer = await answerOwnOrderQuestion(user?.id);
    if (orderAnswer) {
      return c.json(ok({ ...orderAnswer, source: "assistant" as const, products: [] }));
    }
  }

  const products = await recommendProducts(text);
  const productContext = products.length
    ? products
        .map(
          (p) =>
            `- ${p.title} — ${p.categoryName}, ${p.location} — ` +
            `${p.purchasePrice ? `buy ₹${(p.purchasePrice / 100).toFixed(0)}` : "not for sale"}` +
            `${p.rentalPricePerDay ? `, rent ₹${(p.rentalPricePerDay / 100).toFixed(0)}/day` : ""}` +
            (p.ratingCount > 0 ? `, ${p.ratingAverage.toFixed(1)}★ (${p.ratingCount})` : ""),
        )
        .join("\n")
    : "";

  if (CHATBOT_API_KEY) {
    try {
      const reply = await askProvider(messages, buildSystemPrompt(productContext), c.signal);
      if (reply) {
        return c.json(
          ok({
            reply,
            source: "ai" as const,
            products,
            suggestions: DEFAULT_SUGGESTIONS,
          }),
        );
      }
    } catch (error) {
      console.error("[chat] provider call failed, falling back to knowledge base:", error);
    }
  }

  const fallback = buildFallbackReply(text, products);
  return c.json(ok({ ...fallback, products }));
});

/* ------------------------------ product lookup ------------------------------ */

type ChatProduct = Awaited<ReturnType<typeof searchProducts>>["rows"][number];

type ProductAttempt = { q: string; type?: "RENT" | "SALE" };

async function recommendProducts(message: string): Promise<ChatProduct[]> {
  if (!isProductSeeking(message)) return [];

  const query = deriveProductQuery(message);
  if (!query) return [];

  // Respect the verb in the question: "a camera to rent" should surface rentals.
  const typeHint: "RENT" | "SALE" | undefined = /\b(rent|rental|renting|borrow|hire)\b/i.test(
    message,
  )
    ? "RENT"
    : /\b(buy|buying|purchase)\b/i.test(message)
      ? "SALE"
      : undefined;

  // Product search matches whole substrings, so "camera rent" finds nothing even
  // when "camera" matches plenty. Try the full phrase first (most specific), then
  // the individual terms longest-first. If a type-filtered search comes up empty,
  // fall back to the same terms without the filter.
  const terms = [...query.split(" ")].sort((a, b) => b.length - a.length);
  // Singular forms too: "bicycles" should still match "bicycle"-style titles.
  const singulars = terms
    .filter((term) => term.length > 4 && term.endsWith("s"))
    .map((term) => term.slice(0, -1));
  const order = [query, ...terms, ...singulars].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  const attempts: ProductAttempt[] = [];
  const push = (attempt: ProductAttempt) => {
    if (!attempts.some((x) => x.q === attempt.q && x.type === attempt.type)) attempts.push(attempt);
  };
  if (typeHint) order.forEach((q) => push({ q, type: typeHint }));
  order.forEach((q) => push({ q }));

  for (const attempt of attempts) {
    try {
      const parsed = productSearchSchema.parse({ ...attempt, page: 1, pageSize: 3 });
      const { rows } = await searchProducts(parsed);
      if (rows.length) return rows;
    } catch {
      // Ignore a bad candidate and try the next one — chat must never 500.
    }
  }

  return [];
}

/* ---------------------------------- AI call --------------------------------- */

type ChatMessage = z.infer<typeof messageSchema>;

async function askProvider(
  messages: ChatMessage[],
  systemPrompt: string,
  clientSignal: AbortSignal | undefined,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  // Bail out early if the browser drops the request (missing on some runtimes).
  const onAbort = () => controller.abort();
  clientSignal?.addEventListener?.("abort", onAbort);

  try {
    const response = await fetch(`${CHATBOT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHATBOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHATBOT_MODEL,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`provider responded ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = body.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } finally {
    clearTimeout(timeout);
    clientSignal?.removeEventListener?.("abort", onAbort);
  }
}

/* -------------------------------- fallback ---------------------------------- */

function buildFallbackReply(message: string, products: ChatProduct[]) {
  const match = answerFromKnowledge(message);
  const seeking = isProductSeeking(message);

  if (seeking && products.length) {
    const top = products[0]!;
    const extra = products.length > 1 ? ` I also found ${products.length - 1} more.` : "";
    return {
      reply: `Here's something that fits: “${top.title}” in ${top.location}.${extra} Tap a card below to see the full details.`,
      source: "assistant" as const,
      suggestions: ["How does renting work?", "What is a security deposit?"],
    };
  }

  if (match && match.score >= 2) {
    return {
      reply: match.entry.answer,
      source: "assistant" as const,
      suggestions: match.entry.suggestions ?? DEFAULT_SUGGESTIONS,
    };
  }

  if (seeking) {
    return {
      reply:
        "I couldn't find anything matching that just yet. Try a different keyword, or browse everything nearby — new listings land all the time.",
      source: "assistant" as const,
      suggestions: ["Browse listings", "How does renting work?"],
    };
  }

  if (products.length) {
    return {
      reply: "Here's what I found nearby — tap a card to take a closer look.",
      source: "assistant" as const,
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  return {
    reply:
      "I'm not sure about that one yet. I can help you find things to rent or buy, explain deposits, delivery, returns and selling, or point you at the right page. Try one of these:",
    source: "assistant" as const,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}
