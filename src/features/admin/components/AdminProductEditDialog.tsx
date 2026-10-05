import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
// Aliased on import so the ~20 call sites below read as `<Field …>`, which is how every
// other form in the app spells it. The shared implementation lives in `AdminField.tsx`
// alongside the checkbox and URL inputs, so the workspace has one treatment of
// labels, hints and `role="alert"` errors.
import { AdminCheckbox, AdminField as Field } from "./AdminField";
import type { AdminProductDetail } from "../api";
import type { AdminProductFacets } from "../types";
import {
  ADMIN_LISTING_TYPE_OPTIONS,
  ADMIN_STATUS_OPTIONS,
  adminProductFormSchema,
  toAdminProductFormValues,
  toAdminProductPayload,
} from "./schema";

/**
 * The admin catalogue edit dialog.
 *
 * ## Why it is handed the listing rather than a table row
 *
 * `AdminProductRow` is built for the table: eleven denormalised columns, no
 * description, no deposit, no optional price tiers. Prefilling a form from it
 * would open an editor whose "Save" silently blanks every field the table does not
 * show. So the caller fetches `AdminProductDetail` (`useAdminProductDetail`) and
 * passes the record; `undefined` while it is in flight, which is what the skeleton
 * reads.
 *
 * ## Why the state is reset on `product.id`
 *
 * The dialog stays mounted and is re-opened for different listings. Keying the
 * reset on the id means opening product B never leaves product A's half-typed title
 * behind, while re-rendering — including every keystroke — leaves the field being
 * typed into alone.
 *
 * ## Images are not edited here
 *
 * A listing's photos are rows in `product_images` with their own ordering and
 * primary-flag rules, and `/admin/product-images` already owns them. A second,
 * weaker uploader here would be exactly the duplicate system the brief rules out.
 */
export function AdminProductEditDialog({
  product,
  facets,
  open,
  onOpenChange,
  onSubmit,
  saving,
  serverError,
}: {
  product: AdminProductDetail | undefined;
  facets: AdminProductFacets | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ReturnType<typeof toAdminProductPayload>) => void;
  saving: boolean;
  serverError: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>
            {product ? (
              <>
                {product.title} · listed by {product.sellerName}. Every change is written to the
                audit log.
              </>
            ) : (
              "Loading the listing…"
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Keyed on the product id, and that key *is* the state reset.
            The dialog stays mounted and is re-opened for different listings, so the form
            has to start from the stored record every time. Keying the remount does that
            in one place: opening product B builds a brand-new `ProductEditForm` whose
            `useState` initialiser reads product B, so product A's half-typed title and
            A's validation errors are gone — with no effect, no extra render pass, and no
            window in which the form briefly shows A's values under B's heading. */}
        <ProductEditForm
          key={product?.id ?? "pending"}
          product={product}
          facets={facets}
          saving={saving}
          serverError={serverError}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The editable fields and the footer, as one `<form>`.
 *
 * A real form element so Save submits on Enter from any field and so the button is a
 * `submit` rather than an `onClick` handler — a dialog whose save only works when you
 * find the button is a dialog people give up on.
 */
function ProductEditForm({
  product,
  facets,
  saving,
  serverError,
  onCancel,
  onSubmit,
}: {
  product: AdminProductDetail | undefined;
  facets: AdminProductFacets | undefined;
  saving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (payload: ReturnType<typeof toAdminProductPayload>) => void;
}) {
  // The initialiser, not an effect: on first mount the stored record *is* the form.
  const [values, setValues] = useState<Record<string, unknown> | null>(() =>
    product ? toAdminProductFormValues(product) : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setField(name: string, value: unknown) {
    setValues((current) => (current === null ? current : { ...current, [name]: value }));
  }

  const categoryOptions = useMemo(
    () =>
      (facets?.categories ?? []).map((category) => ({
        value: String(category.id),
        label: category.name,
      })),
    [facets],
  );

  function handleSave() {
    if (!values) return;
    const parsed = adminProductFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        // First issue per field wins, so the message is about the first thing to fix
        // rather than whichever one Zod happened to emit last.
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(toAdminProductPayload(parsed.data));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      {values === null ? (
        <FormSkeleton />
      ) : (
        <div className="mt-4 space-y-4">
            {serverError ? (
              <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}

            <Field label="Title" error={errors.title} htmlFor="admin-edit-title">
              <Input
                id="admin-edit-title"
                value={String(values.title ?? "")}
                aria-invalid={!!errors.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </Field>

            <Field label="Description" error={errors.description} htmlFor="admin-edit-description">
              <Textarea
                id="admin-edit-description"
                rows={4}
                value={String(values.description ?? "")}
                aria-invalid={!!errors.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" error={errors.categoryId} htmlFor="admin-edit-category">
                <NativeSelect
                  id="admin-edit-category"
                  label="Category"
                  value={String(values.categoryId ?? "")}
                  onChange={(e) => setField("categoryId", Number(e.target.value))}
                  options={categoryOptions}
                />
              </Field>
              <Field label="Listing type" error={errors.listingType} htmlFor="admin-edit-listing-type">
                <NativeSelect
                  id="admin-edit-listing-type"
                  label="Listing type"
                  value={String(values.listingType ?? "SALE")}
                  onChange={(e) => setField("listingType", e.target.value)}
                  options={ADMIN_LISTING_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </Field>
            </div>

            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Pricing</legend>
              <Field
                label="Purchase price (₹)"
                error={errors.purchasePrice}
                htmlFor="admin-edit-sale-price"
              >
                <PriceInput
                  id="admin-edit-sale-price"
                  value={String(values.purchasePrice ?? "")}
                  onChange={(v) => setField("purchasePrice", v)}
                />
              </Field>
              <Field
                label="Rental price / day (₹)"
                error={errors.rentalPricePerDay}
                htmlFor="admin-edit-rental-price"
              >
                <PriceInput
                  id="admin-edit-rental-price"
                  value={String(values.rentalPricePerDay ?? "")}
                  onChange={(v) => setField("rentalPricePerDay", v)}
                />
              </Field>
              <Field label="Weekly rate (₹)" error={errors.rentalPricePerWeek} htmlFor="admin-edit-weekly">
                <PriceInput
                  id="admin-edit-weekly"
                  placeholder="optional"
                  value={String(values.rentalPricePerWeek ?? "")}
                  onChange={(v) => setField("rentalPricePerWeek", v)}
                />
              </Field>
              <Field
                label="Monthly rate (₹)"
                error={errors.rentalPricePerMonth}
                htmlFor="admin-edit-monthly"
              >
                <PriceInput
                  id="admin-edit-monthly"
                  placeholder="optional"
                  value={String(values.rentalPricePerMonth ?? "")}
                  onChange={(v) => setField("rentalPricePerMonth", v)}
                />
              </Field>
              <Field label="Security deposit (₹)" error={errors.securityDeposit} htmlFor="admin-edit-deposit">
                <PriceInput
                  id="admin-edit-deposit"
                  placeholder="optional"
                  value={String(values.securityDeposit ?? "")}
                  onChange={(v) => setField("securityDeposit", v)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Min days" error={errors.minimumRentalDays} htmlFor="admin-edit-min-days">
                  <Input
                    id="admin-edit-min-days"
                    inputMode="numeric"
                    placeholder="—"
                    value={String(values.minimumRentalDays ?? "")}
                    onChange={(e) => setField("minimumRentalDays", e.target.value)}
                  />
                </Field>
                <Field label="Max days" error={errors.maximumRentalDays} htmlFor="admin-edit-max-days">
                  <Input
                    id="admin-edit-max-days"
                    inputMode="numeric"
                    placeholder="—"
                    value={String(values.maximumRentalDays ?? "")}
                    onChange={(e) => setField("maximumRentalDays", e.target.value)}
                  />
                </Field>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Total stock" error={errors.quantity} htmlFor="admin-edit-quantity">
                <Input
                  id="admin-edit-quantity"
                  inputMode="numeric"
                  value={String(values.quantity ?? "")}
                  onChange={(e) => setField("quantity", e.target.value)}
                />
              </Field>
              <Field label="Available" error={errors.availableQuantity} htmlFor="admin-edit-available">
                <Input
                  id="admin-edit-available"
                  inputMode="numeric"
                  value={String(values.availableQuantity ?? "")}
                  onChange={(e) => setField("availableQuantity", e.target.value)}
                />
              </Field>
              <Field label="Status" error={errors.status} htmlFor="admin-edit-status">
                <NativeSelect
                  id="admin-edit-status"
                  label="Status"
                  value={String(values.status ?? "DRAFT")}
                  onChange={(e) => setField("status", e.target.value)}
                  options={ADMIN_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-muted-foreground">Availability</legend>
              <div className="flex flex-wrap gap-4">
                <AdminCheckbox
                  label="Delivery"
                  checked={!!values.allowsDelivery}
                  onChange={(checked) => setField("allowsDelivery", checked)}
                  error={errors.allowsDelivery}
                />
                <AdminCheckbox
                  label="Pickup"
                  checked={!!values.allowsPickup}
                  onChange={(checked) => setField("allowsPickup", checked)}
                  error={errors.allowsPickup}
                />
              </div>
            </fieldset>
          </div>
        )}

        <DialogFooter className="mt-5">
        <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {/* `type="submit"`: the surrounding <form> runs the Zod validation, so Enter
            from any field saves exactly as clicking here does. */}
        <Button type="submit" disabled={saving || values === null}>
          {saving ? (
            <Loader2 size={15} aria-hidden className="animate-spin" />
          ) : (
            <Save size={15} aria-hidden />
          )}
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A rupee amount field.
 *
 * `type="text"` with `inputMode="decimal"`, not `type="number"`. A number input
 * silently discards a trailing `.` and a bad keystroke, so a half-typed "1200."
 * reads back as "1200" and the admin cannot tell what they typed — which is exactly
 * the field the server will reject. As text, the incomplete value survives to the
 * Zod refinement and is reported back as an error while it is still visible.
 */
function PriceInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder ?? "—"}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading the listing">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
