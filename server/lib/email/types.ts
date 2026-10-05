/**
 * The email contract.
 *
 * ## Why an interface at all
 *
 * Revaro has no email provider and must not have one baked in. SMTP credentials,
 * an API key and a sandbox domain are all deployment decisions, and hardcoding any
 * of them means: a dependency on a vendor in `package.json`, a secret-shaped value
 * in configuration, and a test suite that either needs the network or mocks a module
 * that does not exist yet.
 *
 * So the platform speaks to *this* interface. A real deployment adds an adapter file
 * and one branch in `getEmailProvider`; nothing else in the codebase changes,
 * because nothing else knows what a provider is.
 *
 * ## What a provider may and may not see
 *
 * `EmailMessage` is deliberately the *whole* payload: a recipient, a subject and a
 * rendered text body. There is no `html` field that takes raw HTML from a caller,
 * because the only content this app ever sends is composed by
 * `renderEmailBody()` from a template plus a handful of values — so there is no
 * untrusted-HTML surface for a provider adapter to have to sanitise. The renderer
 * does all the escaping.
 */

/** The events that can produce an email. */
export const EMAIL_TEMPLATES = [
  "ORDER_CONFIRMATION",
  "PAYMENT_CONFIRMATION",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "RENTAL_REMINDER",
  "REFUND_COMPLETED",
  "SELLER_LISTING_APPROVED",
] as const;

export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export function isEmailTemplate(value: unknown): value is EmailTemplate {
  return typeof value === "string" && (EMAIL_TEMPLATES as readonly string[]).includes(value);
}

/** Human labels, for logging and for any future admin-facing delivery report. */
export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  ORDER_CONFIRMATION: "Order confirmation",
  PAYMENT_CONFIRMATION: "Payment confirmation",
  ORDER_SHIPPED: "Order shipped",
  ORDER_DELIVERED: "Order delivered",
  RENTAL_REMINDER: "Rental return reminder",
  REFUND_COMPLETED: "Refund completed",
  SELLER_LISTING_APPROVED: "Listing approved",
};

export type EmailMessage = {
  /** Absolute address. Validated at the provider, never trusted from a request. */
  to: string;
  subject: string;
  /** Already-rendered, already-escaped plain text. */
  body: string;
  /** Which template produced this, so a provider can thread or batch by it. */
  template: EmailTemplate;
};

/**
 * What an adapter must provide.
 *
 * `isProductionReady` mirrors `PaymentProvider` and `StorageProvider`: it is the
 * signal that lets a development adapter refuse to run in production rather than
 * quietly swallowing real customers' mail. `deliver` throws on failure — the caller
 * (`deliverEmail`) decides what a failure means, which is always "log it and move
 * on", never "fail the order".
 */
export type EmailProvider = {
  readonly name: string;
  readonly isProductionReady: boolean;
  deliver(message: EmailMessage): Promise<void>;
};