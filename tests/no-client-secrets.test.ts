import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No credentials in client code.
 *
 * ## What this is protecting
 *
 * The login page used to render `Password: revaro-dev-2026` under the form. That is
 * a credential in the browser bundle — visible in View Source, in `dist/assets/*.js`,
 * and to anyone who opens DevTools. It is also *wrong* in any deployment that sets
 * `ADMIN_PASSWORD`, because the hint would keep advertising the repository's value
 * instead of the real one.
 *
 * The seeded credentials now live only in `server/lib/config.ts`, and the seed
 * script prints them to the terminal that ran it.
 *
 * ## Why a test and not a review convention
 *
 * The rule is easy to satisfy by accident. A demo hint is genuinely useful, a fixture
 * wants a known password, and both feel harmless — which is exactly why they keep
 * reappearing. This makes the check mechanical.
 *
 * The scan is deliberately narrow: it looks for *credential-shaped* literals, not the
 * word "password". `PasswordInput`, `passwordHash`, `type="password"` and the auth
 * API's own field names are all legitimate and must not trip it.
 */

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((file) => ({
  path: relative(ROOT, file).replace(/\\/g, "/"),
  contents: readFileSync(file, "utf8"),
}));

/**
 * Strings that would be a real credential if they shipped.
 *
 * `revaro-dev-2026` is the value the seed used to default to. Matching it exactly
 * avoids false positives on words like "password", while still catching the case that
 * actually happened: someone pasting the seeded password into the UI.
 */
const FORBIDDEN_LITERALS = [/revaro-dev-\d{4}/];

describe("client code holds no credentials", () => {
  it("finds the files it is meant to be scanning", () => {
    // Without this, a broken glob makes every assertion below pass vacuously.
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((f) => f.path.includes("features/auth"))).toBe(true);
  });

  it("contains no seeded password literal", () => {
    const offenders = FILES.filter((f) =>
      FORBIDDEN_LITERALS.some((pattern) => pattern.test(f.contents)),
    ).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("does not assign a password from a string literal", () => {
    // Catches a *different* password being pasted in, not just the known one.
    // Matches `PASSWORD = "…"` / `password: "…"` / `apiKey = "…"` and nothing else.
    const assignment =
      /\b(?:password|passwd|secret|apiKey|api_key|token)\b\s*[:=]\s*["'][^"']{6,}["']/i;
    const offenders = FILES.filter((f) => assignment.test(f.contents)).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("does not read a server secret through VITE_ at runtime", () => {
    // A `VITE_`-prefixed variable is inlined into the bundle by Vite at build time, so
    // anything named like a secret under that prefix is published to the browser
    // regardless of how carefully the client code handles it. The prefix is the bug,
    // not the usage.
    const secretThroughVite = /VITE_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|PRIVATE|API_KEY)/;
    const offenders = FILES.filter((f) => secretThroughVite.test(f.contents)).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("does not import server configuration into the browser", () => {
    // `server/lib/config.ts` holds `ADMIN_PASSWORD`. A client import of it would
    // either pull the value in or fail the build in a way that gets "fixed" by
    // inlining the literal — which is the bug above again, by another route.
    const importsServerConfig = /from\s+["'][^"']*server\/lib\/(config|auth)["']/;
    const offenders = FILES.filter((f) => importsServerConfig.test(f.contents)).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("does not import anything from the server at all", () => {
    /*
     * Broader than the config/auth case above, and deliberately so.
     *
     * The notifications feature has a *server* vocabulary module
     * (`server/lib/notification-events.ts`) and a client twin
     * (`src/features/notifications/types.ts`), and `tests/notification-events.test.ts`
     * asserts the two agree. Importing the server one is the obvious way to make them
     * "agree" — by shipping the writer's table, its destinations and its email policy into
     * the browser bundle. The two halves are compiled by separate tsconfigs
     * (`tsconfig.app.json` / `tsconfig.server.json`); this keeps them separate in source
     * as well, and it would catch a `type`-only import that a bundler tree-shakes today
     * and does not tomorrow.
     */
    const importsServer = /from\s+["'][^"']*\/?server\/[^"']*["']/;
    const offenders = FILES.filter((f) => importsServer.test(f.contents)).map((f) => f.path);

    expect(offenders).toEqual([]);
  });
});
