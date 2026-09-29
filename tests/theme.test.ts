import { afterEach, describe, expect, it, vi } from "vitest";
import { applyThemeToDom, isThemePreference, resolveTheme } from "../src/lib/theme/theme-utils";
import { heroSearchSchema } from "../src/features/home/components/schema";

describe("theme preference validation", () => {
  it("accepts light, dark and system", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isThemePreference("blue")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("returns explicit preferences as-is", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves system to the OS preference", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);
    expect(resolveTheme("system")).toBe("dark");

    const lightQuery = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal("matchMedia", lightQuery);
    expect(resolveTheme("system")).toBe("light");

    vi.unstubAllGlobals();
  });
});

describe("applyThemeToDom", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  it("adds the dark class and dataset for dark mode", () => {
    applyThemeToDom("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes the dark class for light mode", () => {
    applyThemeToDom("dark");
    applyThemeToDom("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("hero search schema", () => {
  it("accepts a normal query", () => {
    expect(heroSearchSchema.safeParse({ q: "gaming laptop" }).success).toBe(true);
  });

  it("rejects an empty query", () => {
    expect(heroSearchSchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("rejects an overly long query", () => {
    expect(heroSearchSchema.safeParse({ q: "x".repeat(121) }).success).toBe(false);
  });
});
