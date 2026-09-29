import { createContext, useContext } from "react";
import type { ResolvedTheme, ThemePreference } from "./theme-types";

export type ThemeContextValue = {
  /** What the user picked (light, dark or system). */
  preference: ThemePreference;
  /** What is actually applied right now. */
  theme: ResolvedTheme;
  setTheme: (preference: ThemePreference) => void;
  /** Convenience: cycles light → dark → system. */
  cycleTheme: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
