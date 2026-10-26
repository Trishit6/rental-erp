import type { PreferenceKey } from "../types";

/** Every preference key, in the render order the groups define. */
export const PREFERENCE_KEYS_IN_ORDER = [
  "orders",
  "rentals",
  "payments",
  "seller",
  "wishlist",
  "admin",
] as const;

type ChannelWithEmail = { inApp: boolean; email: boolean };
type ChannelNoEmail = { inApp: boolean };
type AnyChannel = ChannelWithEmail | ChannelNoEmail;

/** One preset: the full effective payload it produces. */
export type PresetPayload = Record<
  PreferenceKey,
  ChannelWithEmail | ChannelNoEmail
>;

/** Named presets for the notification preferences form. */
export const NOTIFICATION_PRESETS: Record<
  "Essential only" | "Recommended" | "Everything" | "Custom",
  PresetPayload
> = {
  "Essential only": {
    orders: { inApp: true, email: false },
    rentals: { inApp: true, email: false },
    payments: { inApp: true, email: false },
    seller: { inApp: true, email: false },
    wishlist: { inApp: true },
    admin: { inApp: true },
  },
  Recommended: {
    orders: { inApp: true, email: true },
    rentals: { inApp: true, email: true },
    payments: { inApp: true, email: true },
    seller: { inApp: true, email: false },
    wishlist: { inApp: true },
    admin: { inApp: true },
  },
  Everything: {
    orders: { inApp: true, email: true },
    rentals: { inApp: true, email: true },
    payments: { inApp: true, email: true },
    seller: { inApp: true, email: true },
    wishlist: { inApp: true },
    admin: { inApp: true },
  },
  Custom: {} as PresetPayload,
};

/** The preset names the form's segmented control offers. */
export const PRESET_NAMES = [
  "Essential only",
  "Recommended",
  "Everything",
  "Custom",
] as const;

/** The notification preference categories, in render order. */
export const CATEGORY_ORDER = [
  "ORDERS",
  "RENTALS",
  "PAYMENTS",
  "SELLER",
  "WISHLIST",
  "ADMIN",
] as const;

/** Whether a channel value type includes an `email` field. */
function isEmailCapable(c: AnyChannel): c is ChannelWithEmail {
  return "email" in c;
}

/**
 * Resolve which preset the current server values match (if any), so the
 * segmented control can auto-select it. A partial fit (a locked category
 * prevents a setting the preset would choose) falls through to "Custom".
 */
export function resolveActivePreset(
  current: Partial<Record<PreferenceKey, AnyChannel>>,
  locked: string[],
): (typeof PRESET_NAMES)[number] {
  for (const name of PRESET_NAMES) {
    const preset = NOTIFICATION_PRESETS[name];
    if (name === "Custom") continue;
    let matches = true;
    for (const key of PREFERENCE_KEYS_IN_ORDER) {
      if (locked.includes(key)) continue;
      const entry = preset[key];
      const currentVal = current[key];
      if (!currentVal) {
        matches = false;
        break;
      }
      const cur = currentVal as AnyChannel;
      if (isEmailCapable(cur) && isEmailCapable(entry)) {
        if (cur.email !== entry.email) {
          matches = false;
          break;
        }
      }
      if (entry.inApp !== cur.inApp) {
        matches = false;
        break;
      }
    }
    if (matches) return name;
  }
  return "Custom";
}

/**
 * Given the server's effective payload and a preset name, return the patch
 * payload that makes the form pick that preset (only the non-locked fields
 * the preset changes). Returns `undefined` when the preset is "Custom" or
 * already active.
 */
export function presetPatch(
  current: Partial<Record<PreferenceKey, AnyChannel>>,
  locked: string[],
  preset: (typeof PRESET_NAMES)[number],
): PresetPayload | undefined {
  if (preset === "Custom") return undefined;
  const patch: Partial<PresetPayload> = {};
  for (const key of PREFERENCE_KEYS_IN_ORDER) {
    if (locked.includes(key)) continue;
    const target = NOTIFICATION_PRESETS[preset][key];
    const currentVal = current[key];
    if (currentVal) {
      const mayHaveEmail = currentVal as AnyChannel;
      const hasEmail = isEmailCapable(mayHaveEmail);
      if (target.inApp !== mayHaveEmail.inApp) {
        patch[key] = target;
      } else if (isEmailCapable(target) && hasEmail) {
        if (mayHaveEmail.email !== target.email) {
          patch[key] = target;
        }
      } else {
        continue;
      }
    }
  }
  return Object.keys(patch).length > 0 ? patch as PresetPayload : undefined;
}
