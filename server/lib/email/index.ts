import type { EmailMessage, EmailProvider, EmailTemplate } from "./types";
import { createConsoleEmailProvider } from "./console";
import { createNoopEmailProvider } from "./noop";

/**
 * Email provider configuration.
 *
 * ## Secrets
 *
 * There are none in this file, and there are none *anywhere* for email yet — no
 * `EMAIL_*_SECRET` is read, nothing is prefixed `VITE_`, and no adapter under
 * `server/lib/email` is bundled for the browser. That is deliberate: the platform
 * has no provider, so it holds no provider credentials. A deployment that adds one
 * adds its keys to the same server-only block `server/lib/config.ts` uses, and
 * `tests/no-client-secrets.test.ts` keeps checking that nothing leaks.
 *
 * The provider is selected by name only, which is all that is needed to keep the
 * contract honest: an adapter that needs credentials resolves them itself, from its
 * own `read*Config()`, exactly as `readSupabaseStorageConfig()` does.
 */
export type EmailConfig = {
  /** Selected provider name. Empty/unset means "send nothing". */
  provider: string;
  /** True when the local capture adapter is in use. */
  isDevelopmentAdapter: boolean;
  /** True when messages will be silently discarded. */
  isUnconfigured: boolean;
};

const DEV_ALIASES = new Set(["", "dev", "local", "none", "noop", "console", "log"]);

export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const raw = (env.EMAIL_PROVIDER ?? "").trim();
  const normalised = raw.toLowerCase();
  if (DEV_ALIASES.has(normalised)) {
    return {
      provider: "none",
      // `console` is the one dev alias that actually captures rather than discards,
      // and it is the one worth distinguishing: a developer setting `EMAIL_PROVIDER`
      // at all wants to see the output.
      isDevelopmentAdapter: normalised === "console" || normalised === "log",
      isUnconfigured: normalised !== "console" && normalised !== "log",
    };
  }
  return { provider: raw, isDevelopmentAdapter: false, isUnconfigured: false };
}

let cached: EmailProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * ## Why this never throws
 *
 * `getPaymentProvider` and `getStorageProvider` both throw a 503 for an unknown
 * provider name, because in those cases the operator asked for something specific
 * and did not get it. Copying that here would mean one wrong `EMAIL_PROVIDER` value
 * took down checkout — the app would be *less* usable with email misconfigured than
 * with email absent, which is backwards.
 *
 * So an unrecognised name degrades to the no-op provider and logs loudly. Email is
 * the second channel; it is never allowed to be the reason an order fails.
 */
export function getEmailProvider(config = readEmailConfig()): EmailProvider {
  if (config.isDevelopmentAdapter) {
    cached ??= createConsoleEmailProvider();
    return cached;
  }
  if (config.isUnconfigured) {
    cached ??= createNoopEmailProvider();
    return cached;
  }

  // A named provider with no adapter behind it yet. Falling through to the no-op
  // rather than throwing is the deliberate choice described above.
  console.warn(
    `[email] unknown EMAIL_PROVIDER="${config.provider}"; no adapter is registered, messages will be discarded`,
  );
  cached ??= createNoopEmailProvider();
  return cached;
}

/** Test seam: drop the memoised provider so env changes take effect. */
export function resetEmailProviderCache(): void {
  cached = null;
}

/**
 * Deliver one message, swallowing failure.
 *
 * ## Why a send failure is never fatal
 *
 * This is called from the middle of business logic that has *already succeeded* — an
 * order exists, a rental is marked returned. If the mail provider is down, the
 * correct outcome is "the order stands and the customer sees it in-app", not "the
 * order rolled back because SMTP timed out". Exactly the reasoning `recordAudit()`
 * documents, and for the same reason.
 *
 * It is awaited, not fire-and-forget, so the write happens inside the caller's error
 * boundary instead of in an unhandled rejection.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  try {
    await getEmailProvider().deliver(message);
    return true;
  } catch (error) {
    console.error(`[email] failed to send ${message.template} to=${message.to}`, error);
    return false;
  }
}

/* --------------------------------- rendering -------------------------------- */

const BASE_URL = (process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Only ever append an absolute internal path to a configured origin. */
function absolute(path: string): string {
  return `${BASE_URL}${path}`;
}

/**
 * Escape text destined for the plain-text body.
 *
 * The body is plain text, so the "dangerous" characters are the ones that would let
 * content escape into *another channel* if a future adapter chose to wrap it in
 * HTML: `<`, `>`, `&`. Escaping them here means no adapter ever has to reason about
 * whether a customer-supplied string — a product title, a review comment, a
 * person's name — is safe to interpolate.
 */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type EmailRenderData = {
  /** The recipient's display name. */
  recipientName: string;
  /** The customer-facing order number, where one applies. */
  orderNumber?: string | null;
  /** The subject line's subject: an item title, a reason, an amount. */
  subjectLine?: string | null;
  /** A short human phrase — a due date, a refund amount, a rejection reason. */
  detail?: string | null;
  /** An internal route the email links to, e.g. `/orders/RV-…`. */
  actionPath?: string | null;
  /** The human phrase for the action button. */
  actionLabel?: string | null;
};

/**
 * Which template a notification type should send, if any.
 *
 * Mapping by *type* rather than by call site means the rule lives in one table: the
 * call site says what happened, this decides how to say it by mail. Types absent
 * from the map have no email form, which is the honest answer for a wishlist price
 * drop or an admin queue event.
 */
const TEMPLATE_BY_TYPE: Record<string, EmailTemplate> = {
  ORDER_PLACED: "ORDER_CONFIRMATION",
  ORDER_CONFIRMED: "ORDER_CONFIRMATION",
  PAYMENT_SUCCESSFUL: "PAYMENT_CONFIRMATION",
  ORDER_SHIPPED: "ORDER_SHIPPED",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  RENTAL_RETURN_DUE: "RENTAL_REMINDER",
  RENTAL_OVERDUE: "RENTAL_REMINDER",
  REFUND_PROCESSED: "REFUND_COMPLETED",
  LISTING_APPROVED: "SELLER_LISTING_APPROVED",
};

export function emailTemplateForType(type: string): EmailTemplate | null {
  return TEMPLATE_BY_TYPE[type] ?? null;
}

const SUBJECTS: Record<EmailTemplate, (data: EmailRenderData) => string> = {
  ORDER_CONFIRMATION: (d) => `Your Revaro order ${d.orderNumber ?? ""} is confirmed`.trim(),
  PAYMENT_CONFIRMATION: (d) => `Payment received for order ${d.orderNumber ?? ""}`.trim(),
  ORDER_SHIPPED: (d) => `Order ${d.orderNumber ?? ""} has shipped`.trim(),
  ORDER_DELIVERED: (d) => `Order ${d.orderNumber ?? ""} has been delivered`.trim(),
  RENTAL_REMINDER: (d) => `Your rental return is due${d.detail ? ` ${d.detail}` : ""}`,
  REFUND_COMPLETED: (d) =>
    `Your refund${d.orderNumber ? ` for order ${d.orderNumber}` : ""} is on its way`.trim(),
  SELLER_LISTING_APPROVED: (d) => `Your listing is now live${d.subjectLine ? `: ${d.subjectLine}` : ""}`,
};

/**
 * Compose the subject and body for one notification.
 *
 * Returns `null` — meaning "send nothing" — when the type has no email form. The
 * caller checks this before touching the provider at all, so an unmailable
 * notification costs one map lookup rather than a provider round-trip.
 */
export function renderEmail(
  template: EmailTemplate,
  data: EmailRenderData,
): Pick<EmailMessage, "subject" | "body"> {
  const subject = SUBJECTS[template](data).slice(0, 200);
  const name = escapeText(data.recipientName);
  const lines = [`Hi ${name},`, "", escapeText(data.subjectLine ?? subject)];

  if (data.detail) {
    lines.push("", escapeText(data.detail));
  }

  if (data.actionPath && data.actionLabel && BASE_URL) {
    lines.push("", `${escapeText(data.actionLabel)}: ${absolute(data.actionPath)}`);
  }

  lines.push("", "— the Revaro team");
  return { subject, body: lines.join("\n") };
}

export * from "./types";