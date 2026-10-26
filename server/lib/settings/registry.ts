/**
 * Settings registry (R13). Defaults equal existing behavior so nothing changes without an override.
 */
export type SettingGroup =
  | "general"
  | "commerce"
  | "rentals"
  | "uploads"
  | "notifications"
  | "moderation"
  | "tax"
  | "support"
  | "payments"
  | "search"
  | "socialProof"
  | "maintenance";

export type SettingDef = {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  defaultValue: unknown;
  sensitive?: boolean;
  expose?: "server" | "public";
  unit?: string;
  validate: (value: unknown) => unknown;
};

function asNumber(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error("Invalid number");
  return n;
}
function asStringArray(v: unknown) {
  if (Array.isArray(v)) {
    return v.map((x) => String(x));
  }
  throw new Error("Invalid array");
}

export const SETTINGS_REGISTRY: SettingDef[] = [
  {
    key: "commerce.platformFeeSaleBp",
    group: "commerce",
    label: "Platform sale fee (basis points)",
    description: "Platform fee for sales in basis points.",
    defaultValue: Number(process.env.PLATFORM_SALE_FEE_PERCENT ?? "10") * 100,
    expose: "public",
    unit: "bp",
    validate: (v) => {
      const n = asNumber(v);
      if (n < 0 || n > 2000) throw new Error("Must be between 0 and 2000");
      return Math.round(n);
    },
  },
  {
    key: "commerce.platformFeeRentalBp",
    group: "commerce",
    label: "Platform rental fee (basis points)",
    description: "Platform fee for rentals in basis points.",
    defaultValue: Number(process.env.PLATFORM_RENTAL_FEE_PERCENT ?? "15") * 100,
    expose: "public",
    unit: "bp",
    validate: (v) => {
      const n = asNumber(v);
      if (n < 0 || n > 2000) throw new Error("Must be between 0 and 2000");
      return Math.round(n);
    },
  },
  {
    key: "rental.minDays",
    group: "rentals",
    label: "Minimum rental days",
    description: "Minimum rental duration in days.",
    defaultValue: 1,
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1 || n > 365) throw new Error("Must be between 1 and 365");
      return Math.round(n);
    },
  },
  {
    key: "rental.maxDays",
    group: "rentals",
    label: "Maximum rental days",
    description: "Maximum rental duration in days.",
    defaultValue: 30,
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1 || n > 3650) throw new Error("Must be between 1 and 3650");
      return Math.round(n);
    },
  },
  {
    key: "rental.lateFeePerDay",
    group: "rentals",
    label: "Late fee per day",
    description: "Late fee per day in INR.",
    defaultValue: 100,
    unit: "INR",
    validate: (v) => {
      const n = asNumber(v);
      if (n < 0 || n > 10000) throw new Error("Must be between 0 and 10000");
      return n;
    },
  },
  {
    key: "rental.depositRules",
    group: "rentals",
    label: "Deposit rules",
    description: "Deposit policy configuration (JSON).",
    defaultValue: { required: false },
    validate: (v) => v,
  },
  {
    key: "rental.cancellation",
    group: "rentals",
    label: "Rental cancellation policy",
    description: "Used by rental cancellation/refunds.",
    defaultValue: { fullRefundBeforeStart: true, depositAlwaysRefunded: true, chargePercentAfterStart: 0 },
    validate: (v) => v,
  },
  {
    key: "tax.rules",
    group: "tax",
    label: "Tax rules",
    description: "Tax configuration (moved to registry).",
    defaultValue: { enabled: false, percent: 0 },
    expose: "public",
    validate: (v) => v,
  },
  {
    key: "uploads.maxBytes",
    group: "uploads",
    label: "Max upload bytes",
    description: "Maximum upload size in bytes.",
    defaultValue: 5 * 1024 * 1024,
    unit: "bytes",
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1024 || n > 50 * 1024 * 1024) throw new Error("Out of range");
      return Math.round(n);
    },
  },
  {
    key: "uploads.allowedMime",
    group: "uploads",
    label: "Allowed MIME types",
    description: "Allowed MIME subset.",
    defaultValue: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    validate: (v) => asStringArray(v),
  },
  {
    key: "notifications.defaults",
    group: "notifications",
    label: "Notification defaults",
    description: "Default notification preferences.",
    defaultValue: { email: true, sms: false },
    validate: (v) => v,
  },
  {
    key: "moderation.keywords",
    group: "moderation",
    label: "Moderation keywords",
    description: "Moderation flag words (migrated).",
    defaultValue: [],
    validate: (v) => asStringArray(v),
  },
  {
    key: "stock.reservationMinutes",
    group: "payments",
    label: "Stock reservation minutes",
    description: "Cart/checkout stock reservation timeout.",
    defaultValue: 10,
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1 || n > 120) throw new Error("Must be between 1 and 120");
      return Math.round(n);
    },
  },
  {
    key: "payments.intentExpiryMinutes",
    group: "payments",
    label: "Payment intent expiry (minutes)",
    description: "Payment intent expiry time.",
    defaultValue: 15,
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1 || n > 60) throw new Error("Must be between 1 and 60");
      return Math.round(n);
    },
  },
  {
    key: "support.slaHours",
    group: "support",
    label: "Support SLA hours",
    description: "Support response SLA hours.",
    defaultValue: 24,
    validate: (v) => {
      const n = asNumber(v);
      if (n < 1 || n > 168) throw new Error("Must be between 1 and 168");
      return Math.round(n);
    },
  },
  {
    key: "socialProof.enabled",
    group: "socialProof",
    label: "Social proof feed",
    description: "Public, anonymised recent-activity feed (rented/bought/listed pings). Privacy rules are fixed in code; this only turns the feed on or off.",
    defaultValue: true,
    expose: "public",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodUPIEnabled",
    group: "payments",
    label: "UPI method enabled",
    description: "Whether UPI is available as a payment method.",
    defaultValue: true,
    expose: "server",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodCardEnabled",
    group: "payments",
    label: "Card method enabled",
    description: "Whether Card is available as a payment method.",
    defaultValue: true,
    expose: "server",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodNetbankingEnabled",
    group: "payments",
    label: "Net banking method enabled",
    description: "Whether Net banking is available as a payment method.",
    defaultValue: true,
    expose: "server",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodWalletEnabled",
    group: "payments",
    label: "Wallet method enabled",
    description: "Whether Wallet is available as a payment method.",
    defaultValue: true,
    expose: "server",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodUPIManualUtr",
    group: "payments",
    label: "UPI manual UTR entry",
    description: "Whether users can manually enter UTR numbers for UPI payments.",
    defaultValue: true,
    expose: "server",
    validate: (v) => {
      if (typeof v === "boolean") return v;
      if (v === "true") return true;
      if (v === "false") return false;
      throw new Error("Invalid boolean");
    },
  },
  {
    key: "payments.methodUPIMaxDailySubmissions",
    group: "payments",
    label: "UPI max daily submissions",
    description: "Maximum number of UTR submissions per user per day.",
    defaultValue: 3,
    expose: "server",
    validate: (v) => {
      const n = Number(v);
      if (Number.isNaN(n) || n < 1 || n > 50) throw new Error("Must be between 1 and 50");
      return Math.round(n);
    },
  },
  {
    key: "payments.methodUMaxPerIntent",
    group: "payments",
    label: "UPI max per intent",
    description: "Maximum UTR submissions per payment intent.",
    defaultValue: 1,
    expose: "server",
    validate: (v) => {
      const n = Number(v);
      if (Number.isNaN(n) || n < 1 || n > 10) throw new Error("Must be between 1 and 10");
      return Math.round(n);
    },
  },
  {
    key: "payments.methodMaxAmount",
    group: "payments",
    label: "Max payment amount (paise)",
    description: "Maximum amount in paise that can be paid in a single intent.",
    defaultValue: 5000000,
    expose: "server",
    validate: (v) => {
      const n = Number(v);
      if (Number.isNaN(n) || n < 100 || n > 10_000_000) throw new Error("Must be between 100 and 10_000_000 paise");
      return Math.round(n);
    },
  },
  {
    key: "payments.methodMinAmount",
    group: "payments",
    label: "Min payment amount (paise)",
    description: "Minimum amount in paise that can be paid in a single intent.",
    defaultValue: 100,
    expose: "server",
    validate: (v) => {
      const n = Number(v);
      if (Number.isNaN(n) || n < 1 || n > 10000) throw new Error("Must be between 1 and 10000 paise");
      return Math.round(n);
    },
  },
  {
    key: "payments.codEligibility",
    group: "payments",
    label: "COD eligibility",
    description: "Which order types COD is allowed for (BUY, RENTAL, or NEVER).",
    defaultValue: "BUY",
    expose: "server",
    validate: (v) => {
      if (typeof v === "string" && ["BUY", "RENTAL", "NEVER"].includes(v)) return v;
      throw new Error("Must be one of: BUY, RENTAL, NEVER");
    },
  },
  {
    key: "payments.netbankingBanks",
    group: "payments",
    label: "Supported net banking banks",
    description: "Comma-separated list of bank codes supported for net banking.",
    defaultValue: "ICICI,HDFC,SBI,AXIS",
    expose: "server",
    validate: (v) => {
      if (Array.isArray(v)) return v.join(",");
      if (typeof v === "string") return v;
      throw new Error("Must be a comma-separated string or array");
    },
  },
  {
    key: "payments.walletId",
    group: "payments",
    label: "Wallet identifier",
    description: "The wallet identifier for wallet payments.",
    defaultValue: "revalo-wallet",
    expose: "server",
    validate: (v) => {
      if (typeof v === "string" && v.length > 0) return v;
      throw new Error("Wallet ID must be a non-empty string");
    },
  },
  {
    key: "payments.intentExpiryMinutes",
    group: "maintenance",
    label: "Maintenance allowlist paths",
    description: "Paths exempt in maintenance mode.",
    defaultValue: ["/api/health", "/api/config/public", "/api/auth/*", "/api/payments/webhook"],
    validate: (v) => asStringArray(v),
  },
];

export function getRegistryEntry(key: string) {
  return SETTINGS_REGISTRY.find((d) => d.key === key);
}
export function listRegistry() {
  return SETTINGS_REGISTRY;
}
