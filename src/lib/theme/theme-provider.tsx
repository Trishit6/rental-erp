import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext } from "./theme-context";
import type { ResolvedTheme, ThemePreference } from "./theme-types";
import { THEME_OPTIONS } from "./theme-types";
import { applyThemeToDom, getStoredTheme, resolveTheme, storeTheme } from "./theme-utils";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredTheme());
  // System-theme changes are external-system subscriptions, so those are fine
  // in effects — but the resolved value for the current preference is derived,
  // not mirrored in an effect (avoids cascading renders).
  const [system, setSystem] = useState<ResolvedTheme>(() => resolveTheme("system"));

  const theme: ResolvedTheme = preference === "system" ? system : preference;

  // Sync the DOM (an external system) with the resolved theme.
  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  // Follow OS changes while in system mode — external subscription + callback.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(media.matches ? "dark" : "light");
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    storeTheme(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      const next = THEME_OPTIONS[(THEME_OPTIONS.indexOf(current) + 1) % THEME_OPTIONS.length]!;
      storeTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ preference, theme, setTheme: setThemePreference, cycleTheme }),
    [preference, theme, setThemePreference, cycleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
