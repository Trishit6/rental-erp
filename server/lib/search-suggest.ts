/**
 * Pure search-suggest helpers (R11 — "ONE SEARCH SYSTEM").
 *
 * Everything a search suggestion endpoint does that a unit test can judge lives
 * here rather than in the route: untrusted-text sanitising, boolean-mode query
 * building, did-you-mean edit distance, and the two privacy rules on term
 * history. No file in this module touches the database — `routes/search.ts`
 * composes these with SQL, which keeps this file testable with no database and
 * keeps the SQL free of text munging nobody re-reviews.
 */

/** No layering safety net: every numeric rule is a named constant once. */

/** `/suggest` accepts the same window the navbar search box offers the user. */
export const SUGGEST_MIN_QUERY_LENGTH = 2;
export const SUGGEST_MAX_QUERY_LENGTH = 60;

/** History privacy + retention (see docs/database.md, "search_history"). */
export const HISTORY_MAX_TERM_LENGTH = 60;
/** "Recent searches" shows the last N distinct terms (short list, newest first). */
export const HISTORY_VISIBLE_TERMS = 8;
/** A user's stored terms are pruned to this many, newest kept. */
export const HISTORY_MAX_STORED_TERMS = 50;

/** Trending: last-7-days window, and a term is hidden below this many distinct users. */
export const TRENDING_WINDOW_DAYS = 7;
export const TRENDING_MIN_DISTINCT_USERS = 3;

/* ----------------------------- query sanitising ----------------------------- */

/**
 * Strip what cannot be a search term and collapse what was left.
 *
 * Control/separator classes (`C*`, `Z*`) include NUL, RTL overrides and the
 * confusable homoglyphs that abuse searches try to hide inside; input method
 * edge cases aside, no real product name or category needs them. Whitespace
 * runs collapse to a single space so the tokenizer below sees real words only.
 */
export function sanitizeQuery(raw: string): string {
  return raw.replace(/[\p{C}\p{Z}]+/gu, " ").trim();
}

/**
 * Whether a sanitized query is inside the suggest window.
 * `sanitizeQuery` trims, so length here is the real user-visible length.
 */
export function isQueryInSuggestWindow(query: string): boolean {
  const length = [...query].length;
  return length >= SUGGEST_MIN_QUERY_LENGTH && length <= SUGGEST_MAX_QUERY_LENGTH;
}

/**
 * Split a sanitized query into token words.
 *
 * Unicode-aware `\p{L}\p{N}` keeps Devanagari, accented Latin and CJK words
 * whole; anything else (punctuation, symbols) is a separator, not content.
 * "+" and "-" and the other FULLTEXT operators therefore cannot survive into
 * a token, which is one of two defences against operator injection (the other
 * is the strip inside {@link booleanModeQuery}, belt and braces).
 */
export function tokenize(query: string): string[] {
  if (!query) return [];
  return query.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Characters that change meaning in a boolean-mode or LIKE context. A token
 * from {@link tokenize} cannot contain any of them, but this strip runs again
 * inside the builders so a future caller that passes raw text cannot inject:
 * prune the surface, never trust one call path to have done it.
 */
const OPERATOR_CHARS = /[+\-><()~*@]/g;
const LIKE_WILDCARDS = /[%_]/g;

/**
 * Build the `AGAINST(...)` argument for requirement-mode prefix search.
 *
 * `+tok*` means "documents must contain a word starting with `tok`". Building
 * one operator string for the whole query (rather than one `MATCH` per token)
 * lets MariaDB compute relevance once and rank on it, and the leading `+`s
 * keep this in boolean mode semantics — operators banned in the tokens mean
 * the string can only ever add `+` and `*` by construction.
 */
export function booleanModeQuery(tokens: string[]): string {
  return tokens
    .map((token) => token.replace(OPERATOR_CHARS, ""))
    .filter(Boolean)
    .map((token) => `+${token}*`)
    .join(" ");
}

/** LIKE-per-token prefix patterns, for the no-FULLTEXT fallback on title. */
export function likePrefixes(tokens: string[]): string[] {
  return tokens
    .map((token) => token.replace(LIKE_WILDCARDS, "").replace(OPERATOR_CHARS, ""))
    .filter(Boolean)
    .map((token) => `${token}%`);
}

/* ------------------------------ did you mean ------------------------------- */

/**
 * Restricted Damerau-Levenshtein (optimal string alignment): insert, delete,
 * substitute plus adjacent transposition. Not the full DL metric (no
 * re-transposing a transposed pair), which is exactly right for typos —
 * "sony" ↔ "soyn" cost 1, and costing real keyboard swaps at 1 matters more
 * than full bijection purity no candidate list exercises.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const lenA = [...a].length;
  const lenB = [...b].length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Code-unit slices are safe: every char this compares is \p{L}\p{N} by the
  // time it arrives, so no surrogate pairing mid-comparison.
  const rows: number[][] = [];
  for (let i = 0; i <= lenA; i += 1) rows.push(new Array<number>(lenB + 1).fill(0));
  for (let j = 0; j <= lenB; j += 1) rows[0][j] = j;
  for (let i = 1; i <= lenA; i += 1) rows[i][0] = i;

  const aUnits = [...a];
  const bUnits = [...b];
  for (let i = 1; i <= lenA; i += 1) {
    for (let j = 1; j <= lenB; j += 1) {
      const cost = aUnits[i - 1] === bUnits[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1, // delete
        rows[i][j - 1] + 1, // insert
        rows[i - 1][j - 1] + cost, // substitute
      );
      if (
        i > 1 &&
        j > 1 &&
        aUnits[i - 1] === bUnits[j - 2] &&
        aUnits[i - 2] === bUnits[j - 1]
      ) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1); // transpose
      }
    }
  }
  return rows[lenA][lenB];
}

/**
 * Typo tolerance by term length — the spec's shape, as one function so tests
 * and the caller cannot drift: ≤1 edit for 4–6 chars, ≤2 for longer. A 2–3
 * char term is too short to guess on: one edit there changes a real word
 * ("cpu" → "gpu") and a second is indistinguishable from garbage. The caller
 * skips did-you-mean entirely below that.
 */
export function editTolerance(termLength: number): number {
  if (termLength < avoidGuessingBelow()) return 0;
  return termLength >= 7 ? 2 : 1;
}

function avoidGuessingBelow(): number {
  return 4;
}

/**
 * Best did-you-mean suggestion, or null.
 *
 * `candidates` are the cached live names (active categories + brands). The
 * comparison is case-insensitive; ties break on distance then name, so a list
 * is deterministic and the same query suggests the same word every time.
 */
export function didYouMeanFor(query: string, candidates: string[]): string | null {
  const normalized = query.toLowerCase();
  let best: { name: string; distance: number } | null = null;
  for (const name of candidates) {
    const distance = damerauLevenshtein(normalized, name.toLowerCase());
    const tolerance = editTolerance(normalized.length);
    if (tolerance === 0 || distance > tolerance) continue;
    if (!best || distance < best.distance || (distance === best.distance && name < best.name)) {
      best = { name, distance };
    }
  }
  return best?.name ?? null;
}

/* --------------------------- history privacy rules -------------------------- */

const EMAIL_PATTERN = /\S+@\S+\.\S+/;
/**
 * A "phone number" here is any run of 8+ digits — hand-sets, order numbers,
 * Aadhaar fragments, zero-padded ids. Aiming at national formats would both
 * miss international ones and pass e.g. "1123581321", which is none of our
 * business to correlate a user with.
 */
const DIGIT_RUN_PATTERN = /\d{8,}/;
const TRAILING_DIGIT_RUN_PATTERN = /\d+$/;

/**
 * Terms that look like a specific person's or channel's identifier are not
 * marketplace searches and must never be stored or very precisely correlated:
 * an email, anything containing an 8+ digit run, or a trailing phone-ish body
 * with separators (spaces, dashes, parens). Returns true = skip, silently.
 */
export function isPrivateTerm(term: string): boolean {
  if (EMAIL_PATTERN.test(term)) return true;
  if (DIGIT_RUN_PATTERN.test(term.replace(/[\s\-().+]/g, ""))) return true;
  if (TRAILING_DIGIT_RUN_PATTERN.test(term.trim()) && term.replace(/\D/g, "").length >= 8) return true;
  return false;
}

/** A term is storable when it is non-empty, short enough and not private. */
export function isStorableTerm(term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;
  if ([...trimmed].length > HISTORY_MAX_TERM_LENGTH) return false;
  return !isPrivateTerm(trimmed);
}

/* ------------------------------ popular terms ------------------------------- */

export type TermUsage = { term: string; distinctUsers: number; searches: number };

/**
 * The privacy threshold for trending: a term only becomes public when at least
 * {@link TRENDING_MIN_DISTINCT_USERS} *distinct* users searched it in the
 * window. One person's repeated typo must never headline the site, and neither
 * row ever carries a user id — the caller aggregates, this filters and ranks.
 */
export function trendingTerms(usages: TermUsage[]): TermUsage[] {
  return usages
    .filter((row) => row.distinctUsers >= TRENDING_MIN_DISTINCT_USERS)
    .sort((a, b) => b.searches - a.searches || b.distinctUsers - a.distinctUsers || (a.term < b.term ? -1 : 1));
}

