import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every design token the components reference has to exist.
 *
 * ## The bug this exists to prevent
 *
 * A component wrote `z-[var(--layer-sticky)]`. There is no such token — the
 * stylesheet declares `--layer-header`, `--layer-mobile-bar`, `--layer-floating`,
 * `--layer-panel`, `--layer-overlay` and `--layer-drawer`, and nothing called
 * `sticky`.
 *
 * The failure is silent and total. `z-index: var(--layer-sticky)` is an invalid
 * declaration, so the browser discards it and `z-index` stays `auto`; the header
 * renders, looks correct in isolation, and is then overlapped by whatever draws
 * later. Nothing warns, TypeScript cannot see it, and it only shows up when the
 * layering actually collides — which is exactly the moment it is hardest to
 * diagnose, because the cause is a token in a different file.
 *
 * Tailwind's arbitrary-value syntax makes this easy to introduce: `bg-[var(--x)]`
 * compiles to whatever `--x` happens to be, valid or not. So it is checked here
 * instead of being trusted.
 */

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const STYLES = join(SRC, "styles.css");

/** Every `--token` defined anywhere in the stylesheet, including dark mode. */
function definedTokens(): Set<string> {
  const css = readFileSync(STYLES, "utf8");
  const found = new Set<string>();
  for (const match of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
    found.add(match[1]!);
  }
  return found;
}

/** Every source file under `src/`, skipping non-code and generated trees. */
function sourceFiles(dir: string): string[] {
  const skip = new Set(["node_modules", "routeTree.gen.ts", "dist"]);
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Tokens that are deliberately absent from the stylesheet.
 *
 * These are published onto `document.documentElement` at runtime by the components
 * that own them — `MobileActionBar` sets `--mobile-action-bar-height` from a
 * `ResizeObserver`, and the floating rail sets `--floating-rail-height` the same
 * way — and the stylesheet consumes them with a fallback
 * (`var(--mobile-action-bar-height, 0px)`). So "not in the CSS" is the correct and
 * intended state for these, and they must be listed rather than silently skipped by
 * a fuzzy match.
 */
const RUNTIME_PUBLISHED = new Set(["--mobile-action-bar-height", "--floating-rail-height"]);

/** `var(--token, fallback)` and `var(--token)` references, with the token name. */
function referencedTokens(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const pattern = /var\(\s*(--[a-zA-Z0-9-]+)/g;

  for (const file of sourceFiles(SRC)) {
    if (!/\.(ts|tsx|css)$/.test(file)) continue;
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(pattern)) {
      const token = match[1]!;
      if (RUNTIME_PUBLISHED.has(token)) continue;
      const where = relative(ROOT, file).replace(/\\/g, "/");
      const list = uses.get(token) ?? [];
      list.push(where);
      uses.set(token, list);
    }
  }
  return uses;
}

describe("theme tokens", () => {
  const defined = definedTokens();
  const referenced = referencedTokens();

  it("finds the tokens it is meant to be checking", () => {
    // Guards against this file passing vacuously: if the stylesheet or the glob
    // silently stopped matching, "no undefined tokens" would be true and meaningless.
    expect(defined.has("--divider")).toBe(true);
    expect(defined.has("--layer-header")).toBe(true);
    expect(referenced.size).toBeGreaterThan(5);
  });

  it("defines every token the source references", () => {
    const missing: string[] = [];
    for (const [token, files] of referenced) {
      if (defined.has(token)) continue;
      missing.push(`${token}  (used in ${[...new Set(files)].join(", ")})`);
    }
    expect(missing).toEqual([]);
  });

  it("defines the tokens a sticky surface needs", () => {
    // Spelled out because "used by some component somewhere" is too weak to notice a
    // renamed layer: the header, mobile bar, floating rail and overlays all have to
    // be layered against each other, and the stack is only ordered if these five
    // names keep their meaning.
    for (const token of [
      "--layer-header",
      "--layer-mobile-bar",
      "--layer-floating",
      "--layer-panel",
      "--layer-overlay",
      "--layer-drawer",
    ]) {
      expect(defined.has(token), `${token} is gone`).toBe(true);
    }
  });
});
