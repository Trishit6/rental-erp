/**
 * Feature flag evaluation (R13).
 * WARNING: Never use flags for security controls. They are for rollout/UX only.
 */
import { createHash } from "crypto";

export type FlagAudience = {
  mode: "ALL" | "ROLES" | "USERS";
  roles?: string[];
  userIds?: number[];
};

export type FlagDef = {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  audience: FlagAudience | null;
  description?: string | null;
};

function stableBucket(key: string, salt: string): number {
  const h = createHash("sha256").update(key + ":" + salt).digest();
  const n = h.readUInt32BE(0);
  return n % 100;
}

export function isEnabled(flag: FlagDef, ctx: { userId?: number | null; role?: string | null; anonId?: string | null } = {}): boolean {
  if (!flag.enabled) return false;
  const audience = flag.audience;
  if (audience) {
    if (audience.mode === "USERS") {
      const ids = audience.userIds ?? [];
      if (ctx.userId && ids.includes(ctx.userId)) {
        // still subject to rollout? spec says audience match + rollout; but explicit user allowlist - treat as match
      } else if (!(ctx.userId && ids.includes(ctx.userId))) {
        // if mode USERS, only listed users match
        if (!(ctx.userId && ids.includes(ctx.userId))) return false;
      }
    } else if (audience.mode === "ROLES") {
      const roles = audience.roles ?? [];
      if (!ctx.role || !roles.includes(ctx.role)) return false;
    }
    // ALL passes
  }
  if (flag.rolloutPercent <= 0) return false;
  if (flag.rolloutPercent >= 100) return true;
  const salt = ctx.userId ? String(ctx.userId) : ctx.anonId ? ctx.anonId : "anon";
  const bucket = stableBucket(flag.key, salt);
  return bucket < flag.rolloutPercent;
}

export const KNOWN_FLAGS = [
  "new.checkout",
  "seller.onboarding.v2",
  "catalogue.recommendations",
] as const;
