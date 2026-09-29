import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "../api";
import type {
  CancelPaymentInput,
  CancelPaymentResult,
  CreateIntentInput,
  PaymentIntent,
  PaymentMethodDescriptor,
  PaymentProvider,
  PaymentStatus,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./types";

/**
 * DEVELOPMENT-ONLY payment provider.
 *
 * This is **not** a payment gateway. No money moves, no bank is contacted, and
 * nothing it returns is evidence of a real transaction. It exists so the whole
 * pipeline — intent, verification, webhook, order creation — can be exercised
 * end to end before a real provider is configured.
 *
 * Three things stop it from masquerading as production:
 *
 *  - `isProductionReady` is false, and `getPaymentProvider` refuses to return it
 *    when `NODE_ENV=production`.
 *  - The signature it issues per intent is checked on verification, so a
 *    forged or replayed proof fails even here.
 *  - The signature it accepts on webhooks is an HMAC over the raw body keyed
 *    with `DEV_ONLY_MOCK_SIGNING_KEY`, a constant in this file. It proves the
 *    event came from this process, not from a real provider.
 *
 * The browser is never the authority. `verifyPayment` is called by the server
 * and answers "did this payment complete?" from the provider's own state; a
 * `true` in the request body changes nothing.
 *
 * The intent store is an in-memory Map, so it dies with the process. That is
 * fine for development and is another reason it cannot be mistaken for a real
 * provider: it has no durability, no reconciliation, and no settlement.
 */

const DEV_ONLY_SIGNING_KEY = "revaro-dev-only-mock-signing-key";

type MockIntent = {
  providerPaymentId: string;
  idempotencyKey: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  expiresAt: Date;
};

function sign(payload: string): string {
  return createHmac("sha256", DEV_ONLY_SIGNING_KEY).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const MOCK_TTL_MS = 15 * 60 * 1000;

const METHODS: PaymentMethodDescriptor[] = [
  {
    method: "UPI",
    label: "UPI",
    description: "Pay securely using UPI",
    metadata: { apps: "Any UPI app" },
  },
  {
    method: "CARD",
    label: "Card",
    description: "Credit / Debit Card",
    metadata: { note: "Card details are entered on the provider's secure page" },
  },
  {
    method: "NET_BANKING",
    label: "Net banking",
    description: "Pay directly from your bank account",
  },
  {
    method: "WALLET",
    label: "Wallet",
    description: "Pay using a stored wallet balance",
  },
];

function isExpired(intent: MockIntent): boolean {
  return intent.expiresAt.getTime() <= Date.now();
}

export function createMockPaymentProvider(): PaymentProvider {
  /**
   * Per-instance, not module-level.
   *
   * A shared store would let one provider instance verify (or cancel) an intent
   * another instance created, and would leak state across anything that
   * constructs its own provider — including every test. One factory, one world.
   */
  const intentsByIdempotencyKey = new Map<string, MockIntent>();
  const intentsByProviderId = new Map<string, MockIntent>();

  return {
    name: "dev_mock",
    isProductionReady: false,

    async listMethods() {
      return METHODS;
    },

    async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new HttpError(400, "INVALID_AMOUNT", "Payment amount must be a positive integer.");
      }

      const existing = intentsByIdempotencyKey.get(input.idempotencyKey);
      if (existing) {
        // The same key always yields the same intent. This is what makes a
        // double-clicked Pay button harmless.
        return {
          provider: "dev_mock",
          providerPaymentId: existing.providerPaymentId,
          amount: existing.amount,
          currency: existing.currency,
          status: existing.status,
          clientSecret: existing.clientSecret,
          expiresAt: existing.expiresAt,
        };
      }

      const providerPaymentId = `mock_pay_${randomBytes(12).toString("hex")}`;
      const clientSecret = sign(`${providerPaymentId}:${input.amount}`);

      const intent: MockIntent = {
        providerPaymentId,
        idempotencyKey: input.idempotencyKey,
        clientSecret,
        amount: input.amount,
        currency: input.currency,
        status: "PENDING",
        expiresAt: new Date(Date.now() + MOCK_TTL_MS),
      };

      intentsByIdempotencyKey.set(input.idempotencyKey, intent);
      intentsByProviderId.set(providerPaymentId, intent);

      return {
        provider: "dev_mock",
        providerPaymentId,
        amount: input.amount,
        currency: input.currency,
        status: "PENDING",
        clientSecret,
        expiresAt: intent.expiresAt,
      };
    },

    async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
      const intent = intentsByProviderId.get(input.providerPaymentId);

      if (!intent) {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: input.providerPaymentId,
          amount: 0,
          currency: "INR",
          // An unknown payment can never be completed, so it is terminal.
          isTerminal: true,
          failureReason: "This payment attempt is not recognised.",
        };
      }

      if (intent.status === "SUCCEEDED") {
        return {
          verified: true,
          status: "SUCCEEDED",
          providerPaymentId: intent.providerPaymentId,
          amount: intent.amount,
          currency: intent.currency,
          providerReference: `mock_ref_${intent.providerPaymentId}`,
        };
      }

      if (isExpired(intent)) {
        intent.status = "CANCELLED";
        return {
          verified: false,
          status: "CANCELLED",
          providerPaymentId: intent.providerPaymentId,
          amount: intent.amount,
          currency: intent.currency,
          isTerminal: true,
          failureReason: "This payment attempt expired. Please try again.",
        };
      }

      // A signature, when one is presented, must be correct. This is the branch
      // that makes a forged or replayed proof fail, and it is exercised by the
      // tests and by the "someone edited the request" case.
      //
      // When the server calls with no signature it is asking "did this payment
      // complete?", and the answer is whatever the provider says — the server
      // asked, it is not the browser asserting success.
      const echoed = input.signature;
      if (echoed !== undefined && !safeEqual(echoed, intent.clientSecret)) {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: intent.providerPaymentId,
          amount: intent.amount,
          currency: intent.currency,
          // Not terminal: the payment is still open, the proof just did not
          // check out. The caller may legitimately try again.
          isTerminal: false,
          failureReason: "Payment could not be verified.",
        };
      }

      intent.status = "SUCCEEDED";
      return {
        verified: true,
        status: "SUCCEEDED",
        providerPaymentId: intent.providerPaymentId,
        amount: intent.amount,
        currency: intent.currency,
        providerReference: `mock_ref_${intent.providerPaymentId}`,
      };
    },

    async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult> {
      const intent = intentsByProviderId.get(input.providerPaymentId);
      if (!intent) {
        return {
          cancelled: false,
          status: "FAILED",
          providerPaymentId: input.providerPaymentId,
        };
      }
      if (intent.status === "SUCCEEDED") {
        // Already settled — cancelling must not pretend to reverse it.
        return {
          cancelled: false,
          status: "SUCCEEDED",
          providerPaymentId: intent.providerPaymentId,
        };
      }
      intent.status = "CANCELLED";
      return {
        cancelled: true,
        status: "CANCELLED",
        providerPaymentId: intent.providerPaymentId,
      };
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!signature) return false;
      const expected = sign(rawBody);
      return safeEqual(expected, signature);
    },

    parseWebhookEvent(rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as {
          eventId?: unknown;
          type?: unknown;
          providerPaymentId?: unknown;
          status?: unknown;
          amount?: unknown;
          currency?: unknown;
          failureReason?: unknown;
        };
        if (
          typeof parsed.eventId !== "string" ||
          typeof parsed.providerPaymentId !== "string" ||
          typeof parsed.status !== "string" ||
          typeof parsed.amount !== "number" ||
          typeof parsed.currency !== "string"
        ) {
          return null;
        }
        return {
          eventId: parsed.eventId,
          type: typeof parsed.type === "string" ? parsed.type : parsed.status,
          providerPaymentId: parsed.providerPaymentId,
          status: parsed.status as PaymentStatus,
          amount: parsed.amount,
          currency: parsed.currency,
          failureReason:
            typeof parsed.failureReason === "string" ? parsed.failureReason : undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
