import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser never holds, reads or names a token.
 *
 * ## What is actually at stake
 *
 * The whole design rests on one property: the access and refresh tokens exist
 * only in `HttpOnly` cookies, which JavaScript cannot touch. Every other
 * guarantee follows from it — a token in `localStorage`, in React state, in a
 * URL or in a literal would be readable by any script that runs on the page
 * (and by anything that can read the page's storage), which is precisely the
 * exposure `HttpOnly` exists to prevent. It would also make the token survive
 * logout in storage the app does not control.
 *
 * ## Why a test and not a review convention
 *
 * The rule breaks in ways that look reasonable one line at a time: reading the
 * cookie "just to show the expiry", stashing a refresh token "to avoid a round
 * trip", logging a decoded JWT for debugging. None of them fail a type-check
 * and none of them fail a feature test — the app works, it is merely
 * exfiltratable. Scanning the source makes the property mechanical.
 *
 * The scan is deliberately narrow, in both directions:
 *
 *  - It does **not** ban `localStorage`, which the theme preference and the
 *    cross-tab session ping legitimately use. It bans *where* storage is
 *    written from, so adding a third call site is what trips it.
 *  - It does not ban the words "token", "refresh" or "session" — the auth
 *    feature's own types are full of them. It bans the *shapes*: the cookie
 *    names the server sets, a `document.cookie` read, a JWT header literal.
 */

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((file) => ({
  path: relative(ROOT, file).replace(/\\/g, "/"),
  contents: readFileSync(file, "utf8"),
}));

/** The cookie names the API sets — see `server/lib/auth.ts`. */
const COOKIE_NAMES = ["revaro_access_token", "revaro_refresh_token", "revaro_session"];

/** Only these files may write to browser storage, and neither writes a secret. */
const STORAGE_WRITERS = new Set([
  "src/lib/theme/theme-utils.ts", // the theme preference
  "src/lib/auth/session-sync.ts", // a cross-tab "auth changed, go ask the server" ping
]);

function offenders(pattern: RegExp): string[] {
  return FILES.filter((file) => pattern.test(file.contents)).map((file) => file.path);
}

describe("client code holds no credentials", () => {
  it("finds the files it is meant to be scanning", () => {
    // Without this, every assertion below would pass vacuously on an empty list.
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES.some((f) => f.path.includes("features/auth"))).toBe(true);
    expect(FILES.some((f) => f.path === "src/lib/api/client.ts")).toBe(true);
  });

  it("is scanning for literals the server really uses", () => {
    // The anti-vacuity anchor for the cookie-name check below: the names are
    // read from the file that defines them, so a rename on the server side
    // cannot leave this suite quietly testing a string nothing sets.
    const serverAuth = readFileSync(join(ROOT, "server/lib/auth.ts"), "utf8");
    for (const name of COOKIE_NAMES) {
      expect(serverAuth).toContain(name);
    }
  });
});

describe("no token ever reaches the browser's readable state", () => {
  it("never names an auth cookie", () => {
    // Client code has no business knowing these names: cookies are set, cleared
    // and rotated server-side, and the browser attaches them without help. The
    // legacy `revaro_session` is included because a leftover reader would keep
    // the old scheme alive.
    const offenders = FILES.filter((file) =>
      COOKIE_NAMES.some((name) => file.contents.includes(name)),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("never reads the cookie jar", () => {
    // `document.cookie` cannot see `HttpOnly` anyway, so the only thing reading
    // it could do is confirm to some script which non-HttpOnly cookies exist —
    // and it is the first step of any attempt to move a token into JS state.
    expect(offenders(/document\.cookie/)).toEqual([]);
  });

  it("never touches sessionStorage", () => {
    // Unlike `localStorage` (below), there is no legitimate use of session
    // storage anywhere in the app: it is per-tab, still script-readable and
    // still survives a logout within the tab.
    expect(offenders(/sessionStorage/)).toEqual([]);
  });

  it("never embeds a JWT-shaped literal", () => {
    // `eyJ` is the base64url of `{"` — the start of every HS256 JWT header. A
    // matching literal in source is a token that was pasted in, whether as a
    // fixture, a debug value or a default.
    expect(offenders(/\beyJ[A-Za-z0-9_-]{6,}/)).toEqual([]);
  });

  it("never sends an Authorization header", () => {
    // The transport is cookies plus `credentials: "include"`; a Bearer header
    // would mean the token was readable by the code that sets it.
    expect(offenders(/Authorization\s*:/)).toEqual([]);
    expect(offenders(/\bBearer\s+[A-Za-z0-9._-]/)).toEqual([]);
  });
});

describe("storage writes stay where they belong", () => {
  it("is written to from only the theme and the cross-tab ping", () => {
    // Adding a third call site is what trips this. Neither existing writer can
    // hold a credential: one writes `light | dark | system`, the other writes
    // `signed-in:1712345678` — a coarse event, never an identity.
    const writers = FILES.filter((file) => /localStorage\s*\.\s*setItem/.test(file.contents)).map(
      (file) => file.path,
    );

    expect(writers.length).toBeGreaterThan(0);
    expect(writers.filter((path) => !STORAGE_WRITERS.has(path))).toEqual([]);
  });
});
