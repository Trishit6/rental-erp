import { Link } from "@tanstack/react-router";
import { ArrowRight, Lock, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils/cn";
import { NotificationPreferencesSection } from "@/features/notifications/components/NotificationPreferencesSection";

/**
 * `/settings` — account preferences.
 *
 * The page deliberately does *not* duplicate the profile: personal details,
 * password and sessions live on `/profile` (a link points there), while
 * everything that is genuinely a *preference* — the theme and the
 * notification channels — lives here, each backed by a real store
 * (the theme provider and the notifications feature's preference endpoint).
 */

const THEME_CHOICES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function SettingsPage() {
  const { preference, setTheme } = useTheme();

  return (
    <div className="page-wrap space-y-6 pb-12 pt-8">
      <header className="space-y-1.5">
        <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          How Revaro looks and what it tells you about.
        </p>
      </header>

      <Card id="appearance" className="space-y-5 p-6">
        <div>
          <h2 className="flex items-center gap-2 section-title text-lg">
            <Palette size={17} aria-hidden className="text-primary" />
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick how the app looks. “System” follows your device setting.
          </p>
        </div>

        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
          {THEME_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={preference === choice.value}
              onClick={() => setTheme(choice.value)}
              className={cn(
                "soft-button flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4 text-sm font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                preference === choice.value
                  ? "bg-primary/12 text-primary"
                  : "text-foreground hover:text-primary",
              )}
            >
              <choice.icon size={18} aria-hidden />
              {choice.label}
            </button>
          ))}
        </div>
      </Card>

      <NotificationPreferencesSection />

      <Card className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
            <Lock size={17} aria-hidden />
          </span>
          <div>
            <h2 className="font-heading text-base font-extrabold">Account security</h2>
            <p className="text-sm text-muted-foreground">
              Change your password and manage active sessions on your profile.
            </p>
          </div>
        </div>
        <Link
          to="/profile"
          className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Go to profile
          <ArrowRight size={13} aria-hidden />
        </Link>
      </Card>
    </div>
  );
}