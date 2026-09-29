export const THEME_OPTIONS = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

/** The resolved theme actually applied to the DOM. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "revaro-theme";
