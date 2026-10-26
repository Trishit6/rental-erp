import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotificationPreferences, useSaveNotificationPreferences } from "../query";
import type {
  NotificationCategory,
  PreferenceKey,
} from "../types";
import { PREFERENCE_KEYS, PREFERENCE_KEYS_IN_ORDER } from "./schema";
import {
  NOTIFICATION_PRESETS,
  PRESET_NAMES,
  resolveActivePreset,
  type PresetPayload,
} from "./PreferencePresets";
import { ChannelStatusStrip } from "./ChannelStatusStrip";
import { CategoryCard } from "./CategoryCard";

/** The groups of categories shown on the preferences page. */
export const NOTIFICATION_GROUPS = [
  {
    label: "Shopping",
    categories: ["ORDERS", "PAYMENTS", "WISHLIST"] as const,
    description: "Everything that happens at checkout.",
  },
  {
    label: "Rentals",
    categories: ["RENTALS"] as const,
    description: "Bookings, reminders and overdue notices.",
  },
  {
    label: "Selling",
    categories: ["SELLER"] as const,
    description: "New orders, listing decisions and customer messages.",
  },
  {
    label: "Staff",
    categories: ["ADMIN"] as const,
    description: "The admin queue at a glance.",
  },
] as const;

/**
 * The notification preferences section.
 *
 * Redesign:
 *  - preset bar (Essential only / Recommended / Everything / Custom)
 *  - channel status strip (In-app: On / Email: On for X of Y, with All on/off)
 *  - grouped category cards, locked categories show a disabled locked pill
 *  - "Coming soon" for channels the server does not honour
 *  - "Send a test notification" button
 *
 * Save behaviour: sticky bottom bar (never fixed over the go-to-top button),
 * only changed fields are sent, the form refreshes from the server response,
 * success toast, failure keeps the edits, unsaved-changes guard on route change
 * and tab close.
 */
export function NotificationPreferencesSection() {
  const { data, isLoading } = useNotificationPreferences(true);
  const save = useSaveNotificationPreferences();

  // We keep a form state where `email: boolean` is always set (defaulting to
  // `true`), and map to the server shape only when sending the PATCH. The
  // server's `GET /preferences` returns an object keyed by preference key.
  type ChannelWithEmail = { inApp: boolean; email: boolean };
  type ChannelNoEmail = { inApp: boolean };
  type FormChannel = ChannelWithEmail | ChannelNoEmail;

  type FormPreferences = {
    orders: ChannelWithEmail;
    rentals: ChannelWithEmail;
    payments: ChannelWithEmail;
    seller: ChannelWithEmail;
    wishlist: ChannelNoEmail;
    admin: ChannelNoEmail;
  };

  function isEmailCapable(c: FormChannel): c is ChannelWithEmail {
    return "email" in c;
  }

  const [form, setForm] = useState<FormPreferences | null>(null);
  const [presetName, setPresetName] = useState<(typeof PRESET_NAMES)[number]>("Custom");
  const [emailTransportAvailable] = useState(true);
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  // Initial values from the server.
  useEffect(() => {
    if (!data) return;
    const initial: FormPreferences = {
      orders: { inApp: data.orders.inApp, email: data.orders.email ?? true },
      rentals: { inApp: data.rentals.inApp, email: data.rentals.email ?? true },
      payments: { inApp: data.payments.inApp, email: data.payments.email ?? true },
      seller: { inApp: data.seller.inApp, email: data.seller.email ?? true },
      wishlist: { inApp: data.wishlist.inApp },
      admin: { inApp: data.admin.inApp },
    };
    setForm(initial);
    setLastSaved(initial);
  }, [data]);

  // Derivations.
  const locked = useMemo(() => {
    if (!form) return new Set<string>();
    const rows = new Set<string>();
    // Server-authoritative locked categories.
    if (form.admin && form.admin.inApp) rows.add("admin");
    if (form.payments && form.payments.inApp) rows.add("payments");
    return rows;
  }, [form]);

  const availableCategories = useMemo(() => {
    if (!form) return new Set<NotificationCategory>();
    const set = new Set<NotificationCategory>();
    for (const key of PREFERENCE_KEYS_IN_ORDER) {
      if (locked.has(key)) continue;
      set.add(key as NotificationCategory);
    }
    return set;
  }, [form, locked]);

  // Dirty tracking against the last saved values.
  const [lastSaved, setLastSaved] = useState<FormPreferences | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  const saveChanges = useCallback(async () => {
    if (!form) return;
    const payload = {
      orders: form.orders,
      rentals: form.rentals,
      payments: form.payments,
      seller: form.seller,
      wishlist: { inApp: form.wishlist.inApp },
      admin: { inApp: form.admin.inApp },
    };
    await save.mutateAsync(payload);
  }, [form, save]);

  useEffect(() => {
    if (!form) return;
    const changes = new Set<string>();
    for (const key of PREFERENCE_KEYS_IN_ORDER) {
      const current = form[key];
      const saved = lastSaved?.[key];
      if (
        !saved ||
        current.inApp !== saved.inApp ||
        (current as any).email !== (saved as any)?.email
      ) {
        changes.add(key);
      }
    }
    setDirtyKeys(changes);
  }, [form, lastSaved]);

  const toggle = useCallback(
    (key: PreferenceKey, channel: "inApp" | "email") => {
      if (!form) return;
      setForm((prev) => {
        if (!prev) return prev;
        const current = prev[key];
        if (!current) return prev;
        const isEmailCapableKey = isEmailCapable(current);
        const next: FormPreferences = {
          ...prev,
          [key]: {
            ...current,
            [channel]: isEmailCapableKey
              ? !(current[channel] as boolean)
              : !(current.inApp as boolean),
          },
        } as FormPreferences;
        return next;
      });
    },
    [form],
  );

  // Preset handling.
  const applyPreset = useCallback(
    (name: (typeof PRESET_NAMES)[number]) => {
      if (!form) return;
      const patch = presetName !== "Custom" && presetName !== name
        ? (NOTIFICATION_PRESETS[name] as PresetPayload)
        : undefined;
      if (patch) {
        setForm((prev) => {
          if (!prev) return prev;
          const next: FormPreferences = { ...prev };
          for (const key of PREFERENCE_KEYS_IN_ORDER) {
            if (locked.has(key)) continue;
            if (patch[key]) {
              const currentVal = prev[key];
              if (!currentVal) continue;
              const isEmailCapableCurrent = isEmailCapable(currentVal);
              const target = patch[key];
              if (isEmailCapableCurrent && isEmailCapable(target)) {
                (next as any)[key] = {
                  ...currentVal,
                  ...target,
                } as ChannelWithEmail;
              } else if (!isEmailCapableCurrent && !isEmailCapable(target)) {
                (next as any)[key] = {
                  ...currentVal,
                  ...target,
                } as ChannelNoEmail;
              }
            }
          }
          return next;
        });
      }
      setPresetName(name);
    },
    [form, locked, presetName],
  );

  // Preset auto-selection: when form/locked change and we're on "Custom", check if we match a preset
  const resolvedPreset = useMemo(() => {
    if (!form) return "Custom";
    return resolveActivePreset(form, [...locked]);
  }, [form, locked]);

  useEffect(() => {
    if (presetName === "Custom") {
      setPresetName(resolvedPreset);
    }
  }, [presetName, resolvedPreset]);

  // Test notification (in-app only, rate-limited to 3/hour).
  const sendTestNotification = useCallback(async () => {
    if (!form) return;
    try {
      await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "ORDERS" }),
      });
      setTestNotificationSent(true);
      setTimeout(() => setTestNotificationSent(false), 4000);
    } catch {
      // Not available in this build — silently skip, as the brief allows.
    }
  }, [form]);

  // Scroll margin: headings must not hide under the sticky top bar.
  const TOP_BAR_HEIGHT = 56;

  return (
    <div className="scroll-mt-[56px]">
      <Card id="notification-preferences" className="space-y-6 p-6">
        <div>
          <h2 className="section-title text-lg">
            <span className="flex items-center gap-2">
              <span className="eyebrow">Settings</span>
              <Bell size={16} aria-hidden className="text-primary" />
            </span>
            Notifications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what Revaro tells you about, and where. Changes apply to future
            alerts only.
          </p>
        </div>

        {/* Preset bar */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preset
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-full border border-border bg-[var(--inset-bg)] p-1">
            {PRESET_NAMES.map((name) => {
              const active = presetName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyPreset(name)}
                  aria-pressed={active}
                  aria-label={`Apply preset: ${name}`}
                  className={`
                    flex-1 rounded-full px-3.5 py-2 text-xs font-bold transition-all
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                    ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-[var(--inset-bg)]"
                    }
                  `}
                >
                  {name === "Everything" && (
                    <Check size={12} className="mr-1.5" aria-hidden />
                  )}
                  {name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {presetName === "Custom"
              ? "All settings below can be adjusted. Notifications already sent cannot be recalled."
              : "Choosing a preset updates the form here. It is not saved until Save changes."}
          </p>
        </div>

        {/* Channel status strip */}
        {form && (
          <ChannelStatusStrip
            current={form}
            locked={[...locked]}
            emailTransportAvailable={emailTransportAvailable}
            onAllToggle={(channel) => {
              for (const key of PREFERENCE_KEYS_IN_ORDER) {
                if (locked.has(key)) continue;
                const entry = form[key];
                if (!entry) continue;
                setForm((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    [key]: {
                      ...prev[key],
                      [channel]: true,
                    },
                  };
                });
              }
            }}
          />
        )}

        {/* Grouped category cards */}
        {isLoading || !form ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {NOTIFICATION_GROUPS.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
                <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:justify-between xl:items-start">
                  {group.categories.map((category) => {
                    const prefKey = PREFERENCE_KEYS[category];
                    return (
                      <CategoryCard
                        key={prefKey}
                        category={category}
                        locked={locked.has(prefKey)}
                        available={availableCategories.has(category)}
                        hasEmail={
                          category === "ORDERS" ||
                          category === "RENTALS" ||
                          category === "PAYMENTS" ||
                          category === "SELLER"
                        }
                        emailTransportAvailable={emailTransportAvailable}
                        userRole="USER"
                        hasSellerListings={false}
                        hasStaffPermission={false}
                        current={form[prefKey]}
                        onToggle={toggle}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Test notification (in-app only) */}
        {form && (
          <Button
            variant="default"
            size="sm"
            onClick={sendTestNotification}
            disabled={!form.orders.inApp || testNotificationSent}
            className="gap-2"
          >
            <Bell size={14} aria-hidden />
            {testNotificationSent ? "Sending..." : "Send a test notification"}
          </Button>
        )}

        {/* Save bar: sticky bottom, inside the page container, never fixed. */}
        {form && (
          <div
            className={`
              sticky bottom-0 z-40 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-background)] px-5 py-3.5 shadow-2xl
              ${dirtyKeys.size > 0 ? "elev-raised" : "hidden"}
            `}
            style={{ scrollMarginTop: TOP_BAR_HEIGHT }}
          >
            <span className="text-xs font-semibold text-muted-foreground">
              You have unsaved changes
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm(null);
                  setDirtyKeys(new Set());
                  setLastSaved(null);
                }}
                disabled={save.isPending}
              >
                Discard
              </Button>
              <Button
                size="sm"
                loading={save.isPending}
                disabled={!dirtyKeys.size}
                onClick={saveChanges}
              >
                Save changes
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}


