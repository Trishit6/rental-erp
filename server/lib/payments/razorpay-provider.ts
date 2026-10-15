import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../api";
import type {
  CancelPaymentInput,
  CancelPaymentResult,
  CreateIntentInput,
  PaymentIntent,
  PaymentMethodDescriptor,
  PaymentProvider,
  PaymentStatus,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookEvent,
} from "./types";

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

const METHODS: PaymentMethodDescriptor[] = [
  { method: "UPI", label: "UPI", description: "Pay securely using UPI", metadata: { apps: "Any UPI app" } },
  { method: "CARD", label: "Card", description: "Credit / Debit Card", metadata: { note: "Card details are entered on the provider's secure page" } },
  { method: "NET_BANKING", label: "Net banking", description: "Pay directly from your bank account" },
  { method: "WALLET", label: "Wallet", description: "Pay using a stored wallet balance" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authHeader(cfg: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`;
}

async function request(
  cfg: RazorpayConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotent = false,
): Promise<Record<string, unknown>> {
  const maxAttempts = idempotent ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: authHeader(cfg),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        if (text) json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = {};
      }
      if (!res.ok) {
        const retryable = idempotent && res.status >= 500;
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
        throw new HttpError(502, "PROVIDER_ERROR", "Payment provider request failed.");
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (idempotent && attempt < maxAttempts - 1) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      throw new HttpError(
        isAbort ? 504 : 502,
        isAbort ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
        "Payment provider request failed.",
      );
    }
  }
  throw new HttpError(502, "PROVIDER_ERROR", "Payment provider request failed.");
}

export function createRazorpayProvider(cfg: RazorpayConfig): PaymentProvider {
  const provider: PaymentProvider = {
    name: "razorpay",
    isProductionReady: true,

    async listMethods(): Promise<PaymentMethodDescriptor[]> {
      return METHODS;
    },

    async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new HttpError(400, "INVALID_AMOUNT", "Payment amount must be a positive integer.");
      }
      const currency = input.currency || "INR";
      const body = await request(cfg, "POST", "/orders", {
        amount: input.amount,
        currency,
        receipt: input.idempotencyKey,
        notes: {
          intent_id: input.idempotencyKey,
          ...(input.metadata ?? {}),
        },
      });

      const providerPaymentId = String(body.id ?? "");
      if (!providerPaymentId) {
        throw new HttpError(502, "PROVIDER_ERROR", "Payment provider request failed.");
      }
      return {
        provider: "razorpay",
        providerPaymentId,
        amount: input.amount,
        currency: (typeof body.currency === "string" ? body.currency : currency) || currency,
        status: "PENDING",
      };
    },

    async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
      const orderId = input.orderId ?? input.providerPaymentId;
      const paymentId = input.paymentId;
      const signature = input.signature;

      if (!paymentId || !signature) {
        return {
          verified: false,
          status: "PENDING",
          providerPaymentId: orderId,
          amount: 0,
          currency: "INR",
          isTerminal: false,
          failureReason: "Payment could not be verified.",
        };
      }

      const expected = createHmac("sha256", cfg.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
      const provided = signature.trim().toLowerCase().replace(/^sha256=/, "");
      if (!safeEqual(expected, provided)) {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: orderId,
          amount: 0,
          currency: "INR",
          isTerminal: false,
          failureReason: "Payment could not be verified.",
        };
      }

      let payment: Record<string, unknown>;
      try {
        payment = await request(cfg, "GET", `/payments/${encodeURIComponent(paymentId)}`, undefined, true);
      } catch {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: orderId,
          amount: 0,
          currency: "INR",
          isTerminal: false,
          failureReason: "Payment could not be verified.",
        };
      }

      const currency = typeof payment.currency === "string" ? payment.currency : "INR";
      const amount = typeof payment.amount === "number" ? payment.amount : 0;
      const status = typeof payment.status === "string" ? payment.status : "created";
      const paymentOrderId = typeof payment.order_id === "string" ? payment.order_id : null;

      if (paymentOrderId !== null && paymentOrderId !== orderId) {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: orderId,
          amount,
          currency,
          isTerminal: true,
          failureReason: "Payment order mismatch.",
        };
      }

      if (currency !== "INR") {
        return {
          verified: false,
          status: "FAILED",
          providerPaymentId: orderId,
          amount,
          currency,
          isTerminal: true,
          failureReason: "Unsupported currency.",
        };
      }

      if (status !== "captured") {
        const terminal = status === "failed";
        return {
          verified: false,
          status: terminal ? "FAILED" : "PENDING",
          providerPaymentId: orderId,
          amount,
          currency,
          isTerminal: terminal,
          failureReason: terminal ? "Payment failed." : "Payment not yet captured.",
        };
      }

      return {
        verified: true,
        status: "SUCCEEDED",
        providerPaymentId: orderId,
        amount,
        currency,
        providerReference: typeof payment.id === "string" ? payment.id : paymentId,
      };
    },

    async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentResult> {
      return {
        cancelled: false,
        status: "PENDING",
        providerPaymentId: input.providerPaymentId,
      };
    },

    async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
      try {
        const orderPayments = (await request(
          cfg,
          "GET",
          `/orders/${encodeURIComponent(input.providerPaymentId)}/payments`,
          undefined,
          true,
        )) as { items?: Array<Record<string, unknown>> };

        const items = Array.isArray(orderPayments?.items) ? orderPayments.items : [];
        const captured = items.find((p) => p.status === "captured");
        if (!captured || typeof captured.id !== "string") {
          return {
            refunded: false,
            status: "FAILED",
            providerPaymentId: input.providerPaymentId,
            amount: input.amount,
            failureReason: "No captured payment found on this order.",
          };
        }

        const result = (await request(
          cfg,
          "POST",
          `/payments/${encodeURIComponent(captured.id)}/refund`,
          { amount: input.amount, notes: { reason: input.reason ?? "" } },
          false,
        )) as { id?: string };

        return {
          refunded: result.id !== undefined,
          status: result.id !== undefined ? "SUCCEEDED" : "FAILED",
          providerPaymentId: input.providerPaymentId,
          amount: input.amount,
          providerReference: typeof result.id === "string" ? result.id : undefined,
          failureReason:
            result.id !== undefined ? undefined : "Refund was not processed.",
        };
      } catch {
        return {
          refunded: false,
          status: "FAILED",
          providerPaymentId: input.providerPaymentId,
          amount: input.amount,
          failureReason: "Refund request failed.",
        };
      }
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!signature) return false;
      const expected = createHmac("sha256", cfg.webhookSecret).update(rawBody).digest("hex");
      const provided = signature.trim().toLowerCase().replace(/^sha256=/, "");
      return safeEqual(expected, provided);
    },

    parseWebhookEvent(rawBody) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const obj = parsed as Record<string, unknown> | null;
      const type = typeof obj?.event === "string" ? (obj.event as string) : null;
      if (!type) return null;

      const entity = (
        ((obj?.payload as Record<string, unknown>)?.payment as Record<string, unknown>)?.entity ??
        ((obj?.payload as Record<string, unknown>)?.refund as Record<string, unknown>)?.entity ??
        ((obj?.payload as Record<string, unknown>)?.order as Record<string, unknown>)?.entity ??
        ({} as Record<string, unknown>)
      ) as Record<string, unknown>;

      const orderId =
        typeof entity?.order_id === "string"
          ? (entity.order_id as string)
          : typeof entity?.id === "string" && type.startsWith("order.")
            ? (entity.id as string)
            : null;
      if (!orderId) return null;

      const amount = typeof entity?.amount === "number" ? (entity.amount as number) : 0;
      const currency = typeof entity?.currency === "string" ? (entity.currency as string) : "INR";

      const status: PaymentStatus =
        type === "payment.captured" || type === "order.paid"
          ? "SUCCEEDED"
          : type === "payment.failed" || type === "refund.failed"
            ? "FAILED"
            : type === "refund.processed"
              ? "REFUNDED"
              : "PROCESSING";

      const eventId =
        typeof obj?.event_id === "string"
          ? (obj.event_id as string)
          : typeof obj?.id === "string"
            ? (obj.id as string)
            : createHmac("sha256", "")
                .update(rawBody)
                .digest("hex");

      const event: WebhookEvent = {
        eventId,
        type,
        providerPaymentId: orderId,
        status,
        amount,
        currency,
        failureReason:
          typeof entity?.error_description === "string" ? (entity.error_description as string) : undefined,
        providerReference: typeof entity?.id === "string" ? (entity.id as string) : undefined,
      };
      return event;
    },
  };
  return provider;
}