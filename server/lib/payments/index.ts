import { HttpError } from "../api";
import { createMockPaymentProvider } from "./mock-provider";
import { createRazorpayProvider } from "./razorpay-provider";
import type { PaymentProvider } from "./types";

export type PaymentConfig = {
  provider: string;
  keyId: string | undefined;
  keySecret: string | undefined;
  webhookSecret: string | undefined;
  isDevelopmentMock: boolean;
};

const MOCK_ALIASES = new Set(["", "mock", "dev_mock", "none"]);

export function readPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const raw = (env.PAYMENT_PROVIDER ?? "").trim();
  return {
    provider: MOCK_ALIASES.has(raw.toLowerCase()) ? "dev_mock" : raw,
    keyId: env.RAZORPAY_KEY_ID ?? env.PAYMENT_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET ?? env.PAYMENT_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? env.PAYMENT_WEBHOOK_SECRET,
    isDevelopmentMock: MOCK_ALIASES.has(raw.toLowerCase()),
  };
}

let cached: PaymentProvider | null = null;

export function getPaymentProvider(config = readPaymentConfig()): PaymentProvider {
  if (config.isDevelopmentMock) {
    if ((process.env.NODE_ENV ?? "development") === "production") {
      throw new HttpError(
        503,
        "PAYMENT_NOT_CONFIGURED",
        "Payments are not configured for this environment.",
      );
    }
    cached ??= createMockPaymentProvider();
    return cached;
  }

  if (!config.keyId || !config.keySecret || !config.webhookSecret) {
    throw new HttpError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Payments are not configured for this environment.",
    );
  }

  const name = config.provider.toLowerCase();
  if (name === "razorpay") {
    if (cached?.name !== "razorpay") {
      cached = createRazorpayProvider({
        keyId: config.keyId,
        keySecret: config.keySecret,
        webhookSecret: config.webhookSecret,
      });
    }
    return cached ?? createRazorpayProvider({
      keyId: config.keyId,
      keySecret: config.keySecret,
      webhookSecret: config.webhookSecret,
    });
  }

  throw new HttpError(
    501,
    "PAYMENT_PROVIDER_UNAVAILABLE",
    "This payment provider is not available in this deployment.",
  );
}

export function resetPaymentProviderCache(): void {
  cached = null;
}