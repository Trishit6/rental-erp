/** Pure taxonomy helpers (no DB). */

export function computeDepth(parentDepth: number | null): number {
  const d = (parentDepth ?? 0) + 1;
  if (!Number.isInteger(d) || d < 1 || d > 3) {
    throw new Error("Taxonomy depth out of range");
  }
  return d;
}

export function computePath(parentPath: string | null, id: number): string {
  if (!parentPath) return `/${id}/`;
  const p = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
  return `${p}${id}/`.replace(/\/{2,}/g, "/");
}

export function wouldCreateCycle(
  nodeId: number,
  newParentId: number | null,
  parentsByNode: ReadonlyMap<number, number | null>,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;
  let current: number | null = newParentId;
  const seen = new Set<number>();
  while (current !== null) {
    if (current === nodeId) return true;
    if (seen.has(current)) return true; // malformed guard
    seen.add(current);
    current = parentsByNode.get(current) ?? null;
  }
  return false;
}

export function normalizeBrandName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeTag(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSearchText(product: {
  title: string;
  brandName?: string;
  categoryPathNames?: string[];
  tags?: string[];
  attributeValues?: string[];
}): string {
  const parts = [
    product.title,
    product.brandName,
    ...(product.categoryPathNames ?? []),
    ...(product.tags ?? []),
    ...(product.attributeValues ?? []),
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  // de-duplicate, case-insensitive
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique.join(" ");
}
