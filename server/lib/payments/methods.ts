/**
 * Payment method registry (T2).
 *
 * Per-method configuration stored in platform_settings. The UI reads this
 * to render method picker cards and to know which fields (UTR, UPI VPA, etc.)
 * to show for each method. No concrete provider is referenced — only the
 * abstract `PaymentMethod` type and `listMethods()` from the active provider.
 */

import type { PaymentMethod } from "./types";
import { getSetting } from "../settings/service";
import { getRegistryEntry as getRegistryEntryHelper } from "../settings/registry";

/** Human-readable label for each payment method. */
export const METHOD_LABELS: Record<PaymentMethod, string> = {
  UPI: "UPI",
  CARD: "Card",
  NET_BANKING: "Net banking",
  WALLET: "Wallet",
};

/**
 * Read a method config value from platform_settings, falling back to registry default.
 */
function readMethodSetting<T>(key: string, fallback: T): T {
  const entry = getRegistryEntryHelper(key);
  if (entry) {
    try {
      const raw = getSetting(key);
      if (raw !== undefined) return raw as unknown as T;
    } catch {
      // fall through to fallback
    }
  }
  return fallback;
}

/**
 * Method-specific configuration validated and stored in `platform_settings`.
 * Keys match the `payments.<method>.*.*` pattern in the settings registry.
 */
export type MethodConfig = {
  /** Enabled/disabled for the deployment. */
  enabled: boolean;
  /** Maximum amount in paise (minor units). */
  maxAmount: number;
  /** Minimum amount in paise. */
  minAmount: number;
  /** COD eligibility: "BUY" | "RENTAL" | "NEVER" */
  codEligibility: "BUY" | "RENTAL" | "NEVER";
  /** UPI: allow manual UTR entry. */
  upiManualUtr: boolean;
  /** UPI: maximum daily submissions per user. */
  upiMaxDailySubmissions?: number;
  /** UPI: maximum submissions per intent. */
  upiMaxPerIntent?: number;
  /** NET_BANKING: list of supported bank codes (optional). */
  netbankingBanks?: string[];
  /** WALLET: wallet identifier (optional). */
  walletId?: string;
};

/**
 * Read method config from platform_settings with defaults.
 */
function readMethodConfig(method: PaymentMethod): MethodConfig {
  const prefix = `payments.${method}.`;

  return {
    enabled: getMethodEnabled(method),
    maxAmount: readMethodSetting<number>(`${prefix}maxAmount`, 5_000_000),
    minAmount: readMethodSetting<number>(`${prefix}minAmount`, 100),
    codEligibility: readMethodSetting<"BUY" | "RENTAL" | "NEVER">(`${prefix}codEligibility`, "BUY"),
    upiManualUtr: readMethodSetting<boolean>(`${prefix}upiManualUtr`, true),
    upiMaxDailySubmissions: readMethodSetting<number>(`${prefix}upiMaxDailySubmissions`, 3),
    upiMaxPerIntent: readMethodSetting<number>(`${prefix}upiMaxPerIntent`, 1),
    netbankingBanks: readMethodSetting<string[]>(`${prefix}netbankingBanks`, ["ICICI", "HDFC", "SBI", "AXIS"]),
    walletId: readMethodSetting<string>(`${prefix}walletId`, "revalo-wallet"),
  };
}

/**
 * Check whether a payment method is enabled for the current deployment.
 */
export function getMethodEnabled(method: PaymentMethod): boolean {
  // Check the individual method setting first, then fall back to registry presence
  const enabledKey = `payments.method${method.charAt(0).toUpperCase() + method.slice(1)}Enabled`;
  try {
    const val = getSetting(enabledKey);
    if (val !== undefined) return Boolean(val);
  } catch {
    // fall through
  }
  // Fallback: method is present in the registry (it always is)
  return true;
}

/**
 * Look up the config for a payment method, falling back to defaults.
 */
export function getMethodConfig(method: PaymentMethod): MethodConfig {
  return readMethodConfig(method);
}

/**
 * Validate a method is enabled for the current deployment.
 */
export function isMethodEnabled(method: PaymentMethod): boolean {
  return getMethodEnabled(method);
}

/**
 * Check whether COD is eligible for a given order type.
 */
export function isCodEligible(method: PaymentMethod, orderType: "BUY" | "RENTAL"): boolean {
  const config = getMethodConfig(method);
  if (config.codEligibility === "NEVER") return false;
  if (config.codEligibility === "BUY") return orderType === "BUY";
  if (config.codEligibility === "RENTAL") return orderType === "RENTAL";
  return false;
}

/**
 * Validate a UPI manual UTR number format: exactly 12 digits.
 */
export function validateUtr(utr: string): true {
  if (!/^[0-9]{12}$/.test(utr)) {
    throw new Error("UTR must be exactly 12 digits.");
  }
  return true;
}

/**
 * Check whether a user has exceeded their daily UTR submission limit.
 */
export function canSubmitUtrDaily(countToday: number, maxDaily: number): boolean {
  return countToday < maxDaily;
}

/**
 * Check whether a user has exceeded their per-intent UTR submission limit.
 */
export function canSubmitUtrPerIntent(count: number, maxPerIntent: number): boolean {
  return count < maxPerIntent;
}

/**
 * Get the list of available payment methods for the current deployment,
 * respecting the enabled/disabled status from settings.
 */
export function getAvailableMethods(): PaymentMethod[] {
  const all: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "WALLET"];
  return all.filter(method => isMethodEnabled(method));
}