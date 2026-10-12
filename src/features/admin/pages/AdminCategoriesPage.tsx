import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleSlash, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminField as Field } from "../components/AdminField";
import { AdminConfirmDialog, useConfirmTarget } from "../components/AdminConfirmDialog";
import { formatAdminCount } from "../components/format";
import {
  useAdminCategories,
  useAdminCategoryActiveMutation,
  useCreateAdminCategory,
  useDeleteAdminCategory,
  useReorderAdminCategories,
  useUpdateAdminCategory,
} from "../query";
import type { AdminCategoryRow, AdminCategoryWriteInput } from "../api";

/**
 * `/admin/categories` — the taxonomy, and how it is ordered and offered.
 *
 * ## Why this page now edits rather than only retires
 *
 * The first cut exposed one toggle (`isActive`), on the reasoning that a category is
 * referenced by products and must never be deleted. That is true, but it left three
 * ordinary jobs undone: renaming, reordering, and merging a duplicate away. PROMPT 26
 * adds them, and the delete flow asks *where the listings should move* — so the
 * FK-restrict that made deletion unsafe becomes a question the administrator answers,
 * not an error they discover.
 *
 * ## Order is a whole-list operation
 *
 * `sortOrder` is contiguous and shared by roots and children (`GET /categories` reads
 * them together, ordered by it). Moving a row is therefore "send the new order of the
 * visible ids", not "patch this row's number" — a partial renumber leaves duplicates
 * and the next read disagrees with the last.
 */
export function AdminCategoriesPage() {
  const categories = useAdminCategories();
  const setActive = useAdminCategoryActiveMutation();
  const createCategory = useCreateAdminCategory();
  const updateCategory = useUpdateAdminCategory();
  const deleteCategory = useDeleteAdminCategory();
  const reorder = useReorderAdminCategories();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const remove = useConfirmTarget<AdminCategoryRow>();

  const rows = useMemo(() => categories.data ?? [], [categories.data]);
  // Display order is exactly what the server returned; reordering swaps neighbours
  // within it and posts the whole sequence back.
  const orderedIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  function move(id: number, direction: -1 | 1) {
    const index = orderedIds.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= orderedIds.length) return;
    const reordered = [...orderedIds];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    reorder.mutate(reordered);
  }

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Categories"
        description="The taxonomy products are filed under. Order here is the order customers see; retiring hides a category without touching its listings."
        actions={
          <Button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreating(true);
            }}
          >
            <Plus size={15} aria-hidden />
            New category
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        {categories.isLoading && !categories.data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : categories.isError ? (
          <div className="p-4">
            <EmptyState
              icon={Tag}
              title="Unable to load categories"
              description="The taxonomy could not be fetched. Try again."
              action={
                <Button type="button" onClick={() => void categories.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Tag}
              title="No categories yet"
              description="Create the first category so sellers have somewhere to file their listings."
              action={
                <Button type="button" onClick={() => setCreating(true)}>
                  <Plus size={15} aria-hidden />
                  New category
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--divider)]">
            {rows.map((row, index) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label={`Move ${row.name} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(row.id, -1)}
                    className="rounded p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.name} down`}
                    disabled={index === rows.length - 1 || reorder.isPending}
                    onClick={() => move(row.id, 1)}
                    className="rounded p-0.5 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {row.name}
                    {row.isFeatured ? (
                      <Badge className="bg-primary/15 text-primary">Featured</Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    /{row.slug}
                    {row.parentId ? ` · in ${byId.get(row.parentId)?.name ?? "another category"}` : ""}
                  </p>
                </div>

                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminCount(row.productCount)} listing
                  {row.productCount === 1 ? "" : "s"}
                </span>

                <Badge
                  className={
                    row.isActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  }
                >
                  {row.isActive ? "Active" : "Retired"}
                </Badge>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate({ id: row.id, isActive: !row.isActive })}
                  >
                    <CircleSlash size={14} aria-hidden />
                    {row.isActive ? "Retire" : "Restore"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => {
                      setFormError(null);
                      setEditing(row);
                    }}
                  >
                    <Pencil size={14} aria-hidden />
                    <span className="sr-only">Edit {row.name}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:bg-destructive/10"
                    onClick={() => remove.request(row)}
                  >
                    <Trash2 size={14} aria-hidden />
                    <span className="sr-only">Delete {row.name}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AdminCategoryFormDialog
        open={creating || editing !== null}
        category={editing}
        categories={rows}
        saving={createCategory.isPending || updateCategory.isPending}
        serverError={formError}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
            setFormError(null);
          }
        }}
        onSubmit={(input) => {
          setFormError(null);
          if (editing) {
            updateCategory.mutate(
              { id: editing.id, input },
              {
                onSuccess: () => setEditing(null),
                onError: (error: Error) => setFormError(error.message),
              },
            );
          } else {
            createCategory.mutate(input, {
              onSuccess: () => setCreating(false),
              onError: (error: Error) => setFormError(error.message),
            });
          }
        }}
      />

      <AdminCategoryDeleteDialog
        category={remove.target}
        categories={rows}
        deleting={deleteCategory.isPending}
        onOpenChange={(next) => !next && remove.close()}
        onConfirm={(id, reason, reassignToId) => {
          deleteCategory.mutate(
            { id, reason, reassignToId },
            { onSettled: remove.close },
          );
        }}
      />
    </div>
  );
}

/* ------------------------------- create / edit ------------------------------- */

export function AdminCategoryFormDialog({
  open,
  category,
  categories,
  saving,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  category: AdminCategoryRow | null;
  categories: AdminCategoryRow[];
  saving: boolean;
  serverError: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AdminCategoryWriteInput) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {category
              ? `Changes to ${category.name} are written to the audit log.`
              : "A name is all that is required — the slug is derived from it and kept unique."}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed on the id so reopening for a different row resets the form. */}
        <CategoryForm
          key={category?.id ?? "new"}
          category={category}
          categories={categories}
          saving={saving}
          serverError={serverError}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  categories,
  saving,
  serverError,
  onCancel,
  onSubmit,
}: {
  category: AdminCategoryRow | null;
  categories: AdminCategoryRow[];
  saving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (input: AdminCategoryWriteInput) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parentId, setParentId] = useState<string>(category?.parentId ? String(category.parentId) : "");
  const [error, setError] = useState<string | null>(null);

  // A category cannot be its own parent, and the taxonomy is two levels deep — so the
  // parent options exclude the row being edited and any row that already has a parent.
  const parentOptions = useMemo(
    () => [
      { value: "", label: "Top level" },
      ...categories
        .filter((row) => row.id !== category?.id && row.parentId === null)
        .map((row) => ({ value: String(row.id), label: row.name })),
    ],
    [categories, category?.id],
  );

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Give the category a name of at least 2 characters.");
      return;
    }
    setError(null);
    onSubmit({
      name: trimmed,
      slug: slug.trim() === "" ? undefined : slug.trim().toLowerCase(),
      parentId: parentId === "" ? null : Number(parentId),
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="mt-4 space-y-4">
        {serverError ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
            {serverError}
          </p>
        ) : null}

        <Field label="Name" error={error} htmlFor="admin-category-name">
          <Input
            id="admin-category-name"
            value={name}
            aria-invalid={!!error}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Slug"
          hint="Optional. Derived from the name when left blank."
          htmlFor="admin-category-slug"
        >
          <Input
            id="admin-category-slug"
            value={slug}
            placeholder="auto"
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>

        <Field label="Parent" htmlFor="admin-category-parent">
          <NativeSelect
            id="admin-category-parent"
            label="Parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            options={parentOptions}
          />
        </Field>
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
          {saving ? "Saving…" : category ? "Save changes" : "Create category"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ---------------------------------- delete ---------------------------------- */

function AdminCategoryDeleteDialog({
  category,
  categories,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  category: AdminCategoryRow | null;
  categories: AdminCategoryRow[];
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number, reason: string, reassignToId?: number) => void;
}) {
  const [reassignToId, setReassignToId] = useState("");
  const needsReassign = (category?.productCount ?? 0) > 0;
  const destinations = categories.filter((row) => row.id !== category?.id);

  return (
    <AdminConfirmDialog
      open={category !== null}
      onOpenChange={(next) => {
        if (!next) setReassignToId("");
        onOpenChange(next);
      }}
      subject={category ? `${category.name} · ${category.productCount} listing(s)` : ""}
      title={needsReassign ? "Move listings, then delete" : "Delete this category?"}
      body={
        <div className="space-y-3">
          <p>
            {needsReassign
              ? "This category still holds listings. Choose where they should move — they are reassigned in the same transaction as the delete."
              : "This category is empty and can be removed. This cannot be undone."}
          </p>
          {needsReassign && destinationOptions(destinations, reassignToId, setReassignToId)}
        </div>
      }
      confirmLabel="Delete category"
      tone="destructive"
      requireReason
      reasonLabel="Reason (recorded in the audit log)"
      isSubmitting={deleting}
      onConfirm={(reason) =>
        category &&
        onConfirm(
          category.id,
          reason,
          reassignToId === "" ? undefined : Number(reassignToId),
        )
      }
    />
  );
}

function destinationOptions(
  destinations: AdminCategoryRow[],
  value: string,
  onChange: (value: string) => void,
) {
  return (
    <NativeSelect
      label="Move listings to"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={[
        { value: "", label: "Choose a category…" },
        ...destinations.map((row) => ({ value: String(row.id), label: row.name })),
      ]}
    />
  );
}
