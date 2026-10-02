import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { Category } from "@/lib/types";

/**
 * The category directory — one request, three consumers.
 *
 * ## Why this lives in `lib/` and not in a feature
 *
 * The category list is needed by the categories pages, by Browse's filter panel,
 * by the home page's rails, and by the seller's listing form. It used to be
 * fetched by three separate features (`features/categories`, `features/browse`,
 * `features/home`), each with its own `getCategories` and its own `useCategories`
 * over the *same* query key — three functions to keep in step and no reason for
 * any of them to differ.
 *
 * A feature may not import another feature, so the three copies were the only way
 * to share it before `lib/` existed for exactly this. Now there is one fetch and
 * one hook, and the features delegate to it.
 */

/**
 * Categories change far less often than availability does, so they stay fresh for
 * ten minutes and are retained for an hour — long enough that navigating in and
 * out of the category pages, or opening the seller's form after browsing, never
 * refetches them.
 */
export const CATEGORY_STALE_MS = 10 * 60_000;
export const CATEGORY_GC_MS = 60 * 60_000;

/** All active categories with their real product and subcategory counts. */
export async function fetchCategories(): Promise<Category[]> {
  return (await api.get<Category[]>("/categories")).data;
}

export function useCategoryDirectory() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
    staleTime: CATEGORY_STALE_MS,
    gcTime: CATEGORY_GC_MS,
  });
}

/**
 * The categories as a flat, indented option list for a `<select>`.
 *
 * Flattened here rather than in the form because the hierarchy is a property of
 * the data, not of the control: the seller's form and any future filter both
 * need the same parent → child ordering, and a `<select>` cannot nest `<optgroup>`
 * arbitrarily deep. Depth is expressed in the label (`— Furniture`) rather than
 * in a nested structure, because a nested one has to be walked and this is read
 * by a screen reader as a flat list, which is the honest description of it.
 */
export type CategoryOption = { id: number; name: string; depth: number };

export function toCategoryOptions(categories: Category[]): CategoryOption[] {
  const byParent = new Map<number | null, Category[]>();
  for (const category of categories) {
    const key = category.parentId;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(category);
    else byParent.set(key, [category]);
  }

  const options: CategoryOption[] = [];

  const walk = (parentId: number | null, depth: number) => {
    const siblings = byParent.get(parentId);
    if (!siblings) return;
    // Sorted by the server's own `sortOrder`, with the name as a tiebreak so the
    // list is stable even if two rows share an order.
    for (const category of [...siblings].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    )) {
      options.push({ id: category.id, name: category.name, depth });
      walk(category.id, depth + 1);
    }
  };

  walk(null, 0);
  return options;
}

/**
 * The directory as `<select>` options, ready to render.
 *
 * Returns `[]` rather than throwing or suspending while the request is in
 * flight: a form that renders an empty category list for a frame is fine, and a
 * form that blocks on a public reference list is not — the seller can type their
 * title while the categories arrive.
 */
export function useCategoryOptions(): CategoryOption[] {
  const { data } = useCategoryDirectory();
  return useMemo(() => toCategoryOptions(data ?? []), [data]);
}
