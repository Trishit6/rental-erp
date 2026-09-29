/**
 * Revaro assistant knowledge base.
 *
 * Two consumers:
 *  1. `buildSystemPrompt()` — grounds the AI model in how the marketplace works.
 *  2. `answerFromKnowledge()` — the rule-based fallback used when no AI provider
 *     is configured (no CHATBOT_API_KEY) or the provider call fails.
 *
 * Answers live server-side so they stay in sync with platform config and are
 * never baked into the client bundle.
 */

export type FaqEntry = {
  id: string;
  /** Terms that hint at this topic. Longer / rarer terms are worth more. */
  keywords: string[];
  /** Whole-word phrases that should win outright. */
  phrases: string[];
  answer: string;
  /** Follow-up prompts shown as quick replies after this answer. */
  suggestions?: string[];
};

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "greeting",
    keywords: ["hi", "hey", "hello", "yo", "namaste"],
    phrases: ["good morning", "good evening", "good afternoon"],
    answer:
      "Hey! I'm Loop — the Revaro assistant. I can help you find things to rent or buy, explain how renting and deposits work, or point you at the right page. What are you after?",
    suggestions: ["Find a camera to rent", "How does renting work?", "How do I sell something?"],
  },
  {
    id: "renting",
    keywords: ["rent", "renting", "rental", "borrow", "hire", "per day", "daily"],
    phrases: [
      "how does renting work",
      "how do rentals work",
      "how does rental work",
      "rent to own",
      "renting work",
    ],
    answer:
      "Renting on Revaro is neighbour-to-neighbour. Pick an item, choose your dates, and you pay only for the days you keep it — sellers set daily, weekly and monthly rates, so longer rentals get cheaper. A refundable security deposit is held separately and returned when the item comes back in good shape. You can pay by delivery or meet the seller for pickup.",
    suggestions: [
      "Find something to rent",
      "What is a security deposit?",
      "Can I buy after renting?",
    ],
  },
  {
    id: "deposit",
    keywords: ["deposit", "security", "held", "refundable"],
    phrases: ["security deposit", "how much deposit", "deposit refund", "deposit back"],
    answer:
      "A security deposit is a refundable amount the seller asks for, held separately from the rental fee. It's never counted as seller earnings. Once the item is returned in the agreed condition, the deposit is released back to you. The exact amount is shown on every rental item's page before you book.",
    suggestions: ["How does renting work?", "Cancellation policy"],
  },
  {
    id: "rent-to-own",
    keywords: ["credit", "own", "lease", "instalment", "installment"],
    phrases: ["rent to own", "rent-to-own", "buy after renting", "rent credit"],
    answer:
      "With rent-to-own, part of what you pay in rent converts into credit towards buying the item. The seller sets the credit percentage and a cap, and any credit you've built is applied automatically when you tap Buy on an item you're renting.",
    suggestions: ["Find rent-to-own items", "How does renting work?"],
  },
  {
    id: "buying",
    keywords: ["buy", "buying", "purchase", "sale", "pre-loved", "second hand"],
    phrases: ["how do i buy", "how to buy", "buy an item", "how does buying work"],
    answer:
      "Buying works like any marketplace: open an item, add it to your cart, and check out. You'll see the total including any delivery fee before you confirm, and orders can be tracked from your profile afterwards. Pre-loved items are just regular listings marked as used.",
    suggestions: ["Browse listings", "What are the delivery options?"],
  },
  {
    id: "delivery",
    keywords: ["delivery", "shipping", "courier", "post", "ship", "pickup"],
    phrases: [
      "delivery fee",
      "shipping fee",
      "how much is delivery",
      "how does delivery work",
      "delivery cost",
      "pick up",
    ],
    answer:
      "Each listing supports delivery, pickup, or both — you choose at checkout. Delivery adds a flat fee of ₹49 and pickup is free, arranged directly with the seller. The exact fee for your order is always shown on the checkout summary before you pay.",
    suggestions: ["What are my payment options?", "How do I track my order?"],
  },
  {
    id: "payment",
    keywords: ["payment", "pay", "card", "upi", "razorpay", "upi", "wallet"],
    phrases: ["payment options", "how do i pay", "payment method", "cash on delivery"],
    answer:
      "Checkout uses a payment provider integration — in this development build it runs a mock provider so you can complete orders end to end without real money. Sets of orders, totals and fees are all computed on the server, so what you see at checkout is what gets charged.",
    suggestions: ["Is it safe to pay?", "How do I track my order?"],
  },
  {
    id: "returns",
    keywords: ["return", "returning", "cancel", "cancellation"],
    phrases: [
      "how do i return",
      "how to return",
      "cancel a rental",
      "cancel my order",
      "cancellation policy",
      "return an item",
    ],
    answer:
      "Rentals can be cancelled or marked as returned from your rentals page, and the deposit is released once the item is back. If something arrives damaged or not as described, message the seller from the order or product page and we'll help sort it out.",
    suggestions: ["Contact a seller", "How does renting work?"],
  },
  {
    id: "track-order",
    keywords: ["track", "tracking", "status", "order"],
    phrases: ["track my order", "where is my order", "order status"],
    answer:
      "Open your profile to see every order with its status and tracking number. Sellers update the status as an order moves along, and you'll get a notification when it changes.",
    suggestions: ["View my orders", "Contact a seller"],
  },
  {
    id: "selling",
    keywords: ["sell", "selling", "list", "listing", "seller", "post"],
    phrases: ["how do i sell", "how to sell", "list an item", "start selling", "become a seller"],
    answer:
      "Tap Sell (or “Start selling”) and walk through the listing flow: photos, title, category, condition, price and — if you want to rent it out — your daily, weekly and monthly rates plus rental limits. Once published it appears in browse instantly, and your seller dashboard tracks views, favourites and earnings.",
    suggestions: ["How do seller fees work?", "How do I add photos?"],
  },
  {
    id: "fees",
    keywords: ["fee", "fees", "commission", "charge", "payout", "earnings"],
    phrases: ["seller fees", "platform fee", "how much does revaro take", "payout"],
    answer:
      "Listing is free. When something sells or rents, a small platform fee is deducted and the rest lands in your earnings — you can see the full breakdown per transaction in your seller dashboard.",
    suggestions: ["How do I sell something?", "How do payments work?"],
  },
  {
    id: "account",
    keywords: ["account", "signup", "sign", "register", "login", "password", "profile"],
    phrases: [
      "create an account",
      "sign up",
      "sign in",
      "log in",
      "forgot password",
      "reset password",
    ],
    answer:
      "You can browse everything without an account. Sign in or sign up with your email to save favourites, message sellers, rent, buy or list items — your session stays signed in across visits. If you're having trouble getting in, try the login page again or contact support.",
    suggestions: ["How do I save favourites?", "How do I contact a seller?"],
  },
  {
    id: "favorites",
    keywords: ["favourite", "favorite", "save", "saved", "wishlist", "heart"],
    phrases: ["save an item", "add to favourites", "my favourites", "saved items"],
    answer:
      "Tap the heart on any listing to save it. Your favourites are stored on your account, so they follow you across devices — a quick way to shortlist before you decide.",
    suggestions: ["Browse listings", "How does renting work?"],
  },
  {
    id: "messages",
    keywords: ["message", "chat", "contact", "seller", "ask", "talk"],
    phrases: ["contact seller", "contact a seller", "message the seller", "talk to the seller"],
    answer:
      "Use “Contact seller” on any product page to start a conversation — it's tied to that listing so you both know what you're discussing. All your conversations live under Messages, with unread counts so nothing gets missed.",
    suggestions: ["How does renting work?", "Is the seller verified?"],
  },
  {
    id: "safety",
    keywords: ["safe", "safety", "trust", "verified", "scam", "review", "rating"],
    phrases: ["is it safe", "is this safe", "trusted seller", "verified seller"],
    answer:
      "Sellers can be verified, and every listing carries ratings and reviews from real transactions. Check the seller's profile and reviews, keep payment and conversation on Revaro, and prefer meeting in a public place for handovers.",
    suggestions: ["Find verified sellers", "How do reviews work?"],
  },
  {
    id: "about",
    keywords: ["revaro", "about", "what is", "marketplace"],
    phrases: ["what is revaro", "what does revaro do", "about revaro"],
    answer:
      "Revaro is a neighbour-to-neighbour marketplace to rent, buy and sell things you only need now and then — cameras, drills, sofas, dresses. Instead of buying new, you borrow from someone nearby or give a pre-loved find a second home.",
    suggestions: ["How does renting work?", "Browse listings"],
  },
];

/** Follow-up prompts offered when we have no idea what the user wants yet. */
export const DEFAULT_SUGGESTIONS = [
  "Find something to rent",
  "How does renting work?",
  "What is a security deposit?",
  "How do I sell something?",
];

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "i",
  "me",
  "my",
  "we",
  "you",
  "your",
  "is",
  "are",
  "am",
  "was",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "will",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "and",
  "or",
  "but",
  "with",
  "without",
  "please",
  "hey",
  "hi",
  "hello",
  "want",
  "need",
  "looking",
  "look",
  "find",
  "show",
  "get",
  "give",
  "some",
  "any",
  "have",
  "got",
  "there",
  "here",
  "it",
  "this",
  "that",
  "these",
  "those",
  "how",
  "what",
  "where",
  "when",
  "why",
  "who",
  "which",
  "much",
  "many",
  "help",
  "about",
  "near",
  "nearby",
  "cheap",
  "cheapest",
  "best",
  "good",
  "available",
  "availability",
  // Trading verbs are handled by the rent/buy intent filter, not as search terms.
  "rent",
  "rents",
  "renting",
  "rental",
  "borrow",
  "hire",
  "buy",
  "buys",
  "buying",
  "purchase",
  "purchasing",
  // Time words match too many descriptions to be useful as search terms.
  "weekend",
  "week",
  "weeks",
  "day",
  "days",
  "month",
  "months",
  "today",
  "tonight",
  "tomorrow",
  "soon",
  "next",
  "later",
]);

export type FaqMatch = { entry: FaqEntry; score: number };

/** Score the knowledge base against a message. Returns the best entry, if any. */
export function answerFromKnowledge(message: string): FaqMatch | null {
  const text = ` ${message
    .toLowerCase()
    .replace(/[^a-z0-9₹\s]/g, " ")
    .replace(/\s+/g, " ")} `;
  let best: FaqMatch | null = null;

  for (const entry of FAQ_ENTRIES) {
    let score = 0;
    for (const phrase of entry.phrases) {
      if (text.includes(` ${phrase} `)) score += phrase.split(" ").length * 4;
    }
    for (const keyword of entry.keywords) {
      const needle = ` ${keyword} `;
      if (text.includes(needle)) score += keyword.length > 6 ? 3 : 2;
      else if (keyword.length > 5 && text.includes(keyword)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best;
}

/**
 * Turn a free-text question into a product search query.
 * Returns null when there's nothing meaningful left after removing stopwords.
 */
export function deriveProductQuery(message: string): string | null {
  const cleaned = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const terms = cleaned
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word));

  if (!terms.length) return null;
  return terms.slice(0, 5).join(" ");
}

/** Rough intent check — is the user asking us to surface items? */
export function isProductSeeking(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(find|show|looking for|look for|want|need|recommend|browse|rent|buy|under|below|cheap|around)\b/.test(
      text,
    ) ||
    /\b(do you have|is there|got any|any)\b/.test(text) ||
    /camera|drill|sofa|dress|bike|tent|guitar|laptop|phone|bicycle|furniture|tool/.test(text)
  );
}

/** System prompt that grounds the AI model in the marketplace. */
export function buildSystemPrompt(productContext: string): string {
  return [
    "You are Loop, the friendly in-app assistant for Revaro — a neighbour-to-neighbour",
    "marketplace where people rent, buy and sell items (cameras, drills, sofas, dresses and more).",
    "Currency is Indian Rupees (₹).",
    "",
    "Voice: warm, concise, human. Two or three short sentences unless asked for detail.",
    "Never invent prices, policies, order details or product availability.",
    "Only mention items listed under AVAILABLE LISTINGS below, and link them by title.",
    "",
    "How Revaro works:",
    "- Renting: pay per day, with cheaper weekly/monthly tiers and rental limits set by the seller.",
    "- A refundable security deposit is held separately from the rental fee and released on return.",
    "- Rent-to-own: part of past rent becomes credit towards buying the item (seller-set cap).",
    "- Buying: cart + checkout, delivery (₹49) or free pickup; totals are computed server-side.",
    "- Selling: tap Sell, add photos/prices/rental rates; listing is free, a small platform fee applies on sales.",
    "- Accounts: browse freely; sign in to save favourites, message sellers or transact.",
    "- Favourites, Messages, Orders, Rentals and seller tools all live under the profile/dashboard.",
    "",
    "If the user asks something you can't answer or that needs a human, say so briefly and point them",
    "to the relevant page (browse, product page, orders, messages, seller dashboard).",
    "",
    "AVAILABLE LISTINGS:",
    productContext || "(no matching listings for this question)",
  ].join("\n");
}
