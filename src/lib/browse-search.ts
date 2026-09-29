/**
 * Search-param validation shared by the simple `q`-only routes (pre-loved,
 * rentals). The full product-search schema used by Browse and the category pages
 * lives in `src/lib/product-search/schema.ts`.
 */
export function validateQSearch(search: Record<string, unknown>): { q?: string } {
  const value = search.q;
  if (typeof value !== "string") return { q: undefined };
  const trimmed = value.trim();
  return { q: trimmed === "" ? undefined : trimmed.slice(0, 120) };
}
