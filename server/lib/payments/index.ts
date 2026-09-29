import { HttpError } from "../api";
import { createMockPaymentProvider } from "./mock-provider";
import type { PaymentProvider } from "./types";

/**
 * Payment provider configuration.
 *
 * Secrets live here and only here. Nothing in this module is ever returned to
 * the browser, and no `PAYMENT_*` variable is prefixed with `VITE_` for exactly
 * that reason — a `VITE_`-prefixed value is inlined into the client bundle.
 */
export type PaymentConfig = {
  /** Selected provider name. Empty/unset/`mock` all mean the development mock. */
  provider: string;
  keyId: string | undefined;
  keySecret: string | undefined;
  webhookSecret: string | undefined;
  /** True when no real provider is configured. */
  isDevelopmentMock: boolean;
};

/** Names that explicitly select the development mock. */
const MOCK_ALIASES = new Set(["", "mock", "dev_mock", "none"]);

export function readPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const raw = (env.PAYMENT_PROVIDER ?? "").trim();
  return {
    provider: MOCK_ALIASES.has(raw.toLowerCase()) ? "dev_mock" : raw,
    keyId: env.PAYMENT_KEY_ID,
    keySecret: env.PAYMENT_KEY_SECRET,
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
    isDevelopmentMock: MOCK_ALIASES.has(raw.toLowerCase()),
  };
}

let cached: PaymentProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * Two deliberate refusals:
 *
 *  - The development mock will not run under `NODE_ENV=production`. A dev
 *    payment that renders like a real confirmation is worse than no payment at
 *    all, so the deployment fails loudly instead.
 *  - A real provider name is a 501 until its adapter is implemented. Silently
 *    falling back to the mock would let a half-configured deployment quietly
 *    take development payments and believe they were real.
 */
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

  if (!config.keyId || !config.keySecret) {
    throw new HttpError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Payments are not configured for this environment.",
    );
  }

  throw new HttpError(
    501,
    "PAYMENT_PROVIDER_UNAVAILABLE",
    "This payment provider is not available in this deployment.",
  );
}

/** Test seam: drop the memoised provider so env changes take effect. */
export function resetPaymentProviderCache(): void {
  cached = null;
}
