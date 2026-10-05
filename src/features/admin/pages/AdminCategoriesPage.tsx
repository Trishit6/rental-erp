import { useMemo } from "react";
import { CircleSlash, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminConfirmDialog, useConfirmTarget } from "../components/AdminConfirmDialog";
import { formatAdminCount } from "../components/format";
import { useAdminCategories, useAdminCategoryActiveMutation } from "../query";
import type { AdminCategoryRow } from "../api";

/**
 * `/admin/categories` — the taxonomy, and whether it is offered to customers.
 *
 * ## Retire, never delete
 *
 * `products.category_id` references these rows, so deleting a category would either
 * fail or orphan every listing filed under it. The endpoint exposes one toggle —
 * `isActive` — and that is the honest set of changes available. An inactive category
 * disappears from the customer-facing category filter and from the category pages, but
 * its listings stay filed under it and still resolve, which is what an administrator
 * wants when they reorganise the taxonomy rather than clean up after it.
 *
 * ## The product count is shown because it is the answer to "can I retire this?"
 *
 * `productCount` comes from the same query that lists the categories, so the number in
 * the confirmation is the number the customer would lose access to.
 */

export function AdminCategoriesPage() {
  const categories = useAdminCategories();
  const setActive = useAdminCategoryActiveMutation();
  const confirm = useConfirmTarget<AdminCategoryRow>();

  /**
   * Categories arrive flat with a `parentId`. Rendering them flat with an indent is
   * chosen over building a tree because the schema allows exactly two levels and a
   * tree would be a second, untested code path for a two-level structure. The indent
   * shows the relationship; the parent name is spelled out so the row is readable
   * without the indent.
   */
  const byParent = useMemo(() => {
    const parents = new Map<number, AdminCategoryRow>();
    const children: AdminCategoryRow[] = [];
    for (const row of categories.data ?? []) {
      if (row.parentId === null) parents.set(row.id, row);
      else children.push(row);
    }
    const ordered: (AdminCategoryRow & { parentName: string | null })[] = [];
    for (const parent of [...parents.values()].sort((a, b) => a.sortOrder - b.sortOrder)) {
      ordered.push({ ...parent, parentName: null });
      for (const child of children
        .filter((c) => c.parentId === parent.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)) {
        ordered.push({ ...child, parentName: parent.name });
      }
    }
    // A child whose parent row is missing (a deleted parent, or data from an older
    // import) would otherwise vanish from the screen entirely, which is worse than
    // showing it unindented — surfacing it is what makes the broken reference visible.
    for (const orphan of children.filter((c) => !parents.has(c.parentId!))) {
      ordered.push({ ...orphan, parentName: null });
    }
    return ordered;
  }, [categories.data]);

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Categories"
        description="The product taxonomy. Retiring a category hides it from customers while keeping every listing filed under it."
      />

      <Card className="overflow-hidden p-0">
        {categories.isLoading && !categories.data ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : categories.isError ? (
          <div className="p-4">
            <EmptyState
              icon={Tag}
              title="Unable to load categories"
              description="We couldn't reach the server for this page. Please try again."
              action={
                <Button type="button" onClick={() => void categories.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : byParent.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Categories appear here once they are added to the taxonomy."
            />
          </div>
        ) : (
          <>
            <p className="border-b border-[var(--divider)] px-4 py-2.5 text-xs text-muted-foreground">
              {formatAdminCount(byParent.length)} categories ·{" "}
              {formatAdminCount(
                byParent.reduce((total, row) => total + Number(row.productCount), 0),
              )}{" "}
              listings filed
            </p>
            <ul className="divide-y divide-[var(--divider)]">
              {byParent.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-semibold ${row.parentName ? "pl-4 text-sm" : ""}`}
                    >
                      {row.parentName ? `↳ ${row.name}` : row.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.slug} · {formatAdminCount(row.productCount)} listing
                      {Number(row.productCount) === 1 ? "" : "s"}
                      {row.isFeatured ? " · featured" : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {row.isFeatured ? (
                      <Badge className="whitespace-nowrap bg-primary/12 text-primary">
                        Featured
                      </Badge>
                    ) : null}
                    <Badge
                      className={`whitespace-nowrap ${row.isActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {row.isActive ? "Active" : "Retired"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      disabled={setActive.isPending}
                      onClick={() => confirm.request(row)}
                    >
                      {row.isActive ? (
                        <>
                          <CircleSlash size={14} aria-hidden />
                          Retire
                        </>
                      ) : (
                        "Restore"
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <CategoryVisibilityDialog
        row={confirm.target}
        isSubmitting={setActive.isPending}
        onCancel={confirm.close}
        onConfirm={(isActive) => {
          if (!confirm.target) return;
          const id = confirm.target.id;
          setActive.mutate({ id, isActive }, { onSettled: confirm.close });
        }}
      />
    </div>
  );
}

/**
 * The retire/restore confirmation.
 *
 * The consequence is named before the click because it is not obvious: the count of
 * listings that stop being reachable through the category filter is the number that
 * decides whether this is a tidy-up or a mistake.
 */
function CategoryVisibilityDialog({
  row,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  row: AdminCategoryRow | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (isActive: boolean) => void;
}) {
  if (!row) return null;
  const retiring = row.isActive;

  return (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      subject={`${row.name} (${row.slug})`}
      title={retiring ? "Retire this category?" : "Restore this category?"}
      body={
        retiring ? (
          <p>
            It disappears from the category filter and from its own page. Its{" "}
            <strong className="text-foreground">
              {formatAdminCount(row.productCount)} listing
              {Number(row.productCount) === 1 ? "" : "s"}
            </strong>{" "}
            stay in the marketplace and stay filed under it — nothing is deleted, and this
            can be undone from this page.
          </p>
        ) : (
          <p>
            It reappears in the category filter and its page becomes browsable again, with its{" "}
            {formatAdminCount(row.productCount)} listing
            {Number(row.productCount) === 1 ? "" : "s"} reachable through it.
          </p>
        )
      }
      confirmLabel={retiring ? "Retire category" : "Restore category"}
      isSubmitting={isSubmitting}
      onConfirm={() => onConfirm(!retiring)}
    />
  );
}
