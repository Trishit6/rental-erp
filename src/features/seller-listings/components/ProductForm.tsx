import { useId, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImageUploadConfig } from "@/lib/storage";
import { cn } from "@/lib/utils/cn";
import { CONDITION_LABELS, PRODUCT_CONDITIONS, type ProductCondition } from "../types";
import { ProductImages } from "./ProductImages";
import {
  issueFor,
  showsPurchasePrice,
  showsRentalFields,
  type ProductFormIssue,
  type ProductFormValues,
} from "./schema";

/**
 * The listing form, used for both creating and editing.
 *
 * ## One form, two modes
 *
 * `mode="create"` and `mode="edit"` are the same component with the same
 * validation and the same payload builder. Two forms would be two places for the
 * rules to disagree, and they always do: the moment "a rental listing needs a
 * rental price" is fixed in one and not the other, sellers can create an
 * incoherent listing that the edit form would have refused.
 *
 * ## Conditional sections are hidden, not disabled
 *
 * Switching a listing from `RENT` to `SALE` *removes* the rental fields from the
 * form, and `toPayload` then sends `null` for them. A hidden-but-preserved field
 * would keep a rental price on a sale-only listing — which the server rejects, and
 * correctly: "a sale-only listing cannot carry a rental price" is a fact about
 * the listing, not about which tab the seller was on.
 *
 * ## Validation is on submit, not on every keystroke
 *
 * Marking a field red while it is being typed is noise: a title is invalid at
 * three characters and valid at four, and complaining about the first is
 * complaining about the act of typing. The schema runs on submit, and the
 * messages then stick until the next submit.
 */
export function ProductForm({
  mode,
  values,
  onChange,
  onSubmit,
  submitting = false,
  submitLabel,
  issues,
  storageConfig,
  categories,
  submitError,
}: {
  mode: "create" | "edit";
  values: ProductFormValues;
  onChange: (values: ProductFormValues) => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** From the last `productFormSchema` run; `[]` before the first submit. */
  issues: ProductFormIssue[];
  storageConfig: ImageUploadConfig | null;
  categories: { id: number; name: string }[];
  /** A server-side message, shown above the form rather than on a field. */
  submitError?: string | null;
}) {
  const [attempted, setAttempted] = useState(false);
  const uid = useId();
  const rental = showsRentalFields(values.listingType);
  const sells = showsPurchasePrice(values.listingType);

  function update<K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) {
    onChange({ ...values, [field]: value });
  }

  /**
   * Changing the listing type has to clear the prices that no longer apply,
   * otherwise the form submits a rental-only listing carrying a purchase price
   * and the server refuses it with a message about a field the seller can no
   * longer even see.
   */
  function changeListingType(next: ProductFormValues["listingType"]) {
    onChange({
      ...values,
      listingType: next,
      purchasePrice: showsPurchasePrice(next) ? values.purchasePrice : "",
      rentalPricePerDay: showsRentalFields(next) ? values.rentalPricePerDay : "",
      rentalPricePerWeek: showsRentalFields(next) ? values.rentalPricePerWeek : "",
      rentalPricePerMonth: showsRentalFields(next) ? values.rentalPricePerMonth : "",
      securityDeposit: showsRentalFields(next) ? values.securityDeposit : "",
      minimumRentalDays: showsRentalFields(next) ? values.minimumRentalDays : "",
      maximumRentalDays: showsRentalFields(next) ? values.maximumRentalDays : "",
      rentToOwnEnabled: showsPurchasePrice(next) ? values.rentToOwnEnabled : false,
      rentToOwnPrice: showsPurchasePrice(next) ? values.rentToOwnPrice : "",
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    // The parent re-validates and owns the message; this is the trigger, not the
    // rule. Validating in two places is how the two start disagreeing.
    onSubmit();
  }

  const error = (path: string) => (attempted ? issueFor(issues, path) : "");

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {submitError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
        >
          {submitError}
        </p>
      )}

      <Card className="space-y-4 p-5 sm:p-6">
        <Field label="Title" htmlFor={`${uid}-title`} error={error("title")}>
          <Input
            id={`${uid}-title`}
            value={values.title}
            maxLength={120}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Vintage teak writing desk"
          />
        </Field>

        <Field
          label="Description"
          htmlFor={`${uid}-description`}
          error={error("description")}
          hint="Condition, age, what's included, and anything a buyer should know before they commit."
        >
          <Textarea
            id={`${uid}-description`}
            value={values.description}
            maxLength={5000}
            rows={6}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Solid teak top, one small water ring on the left rear corner. Drawer runs smoothly. Sold as seen."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor={`${uid}-category`} error={error("categoryId")}>
            <select
              id={`${uid}-category`}
              value={values.categoryId}
              onChange={(event) => update("categoryId", event.target.value)}
              className="inset-surface h-11 w-full rounded-full px-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Brand" htmlFor={`${uid}-brand`} error={error("brand")}>
            <Input
              id={`${uid}-brand`}
              value={values.brand}
              maxLength={80}
              onChange={(event) => update("brand", event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Condition</legend>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_CONDITIONS.map((condition) => (
              <Chip
                key={condition}
                active={values.condition === condition}
                onClick={() => update("condition", condition as ProductCondition)}
              >
                {CONDITION_LABELS[condition]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <ProductImages
          images={values.images}
          onChange={(images) => update("images", images)}
          config={storageConfig}
          disabled={submitting}
        />
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div>
          <p className="text-sm font-bold">How do you want to offer it?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You can change this later — but the prices and dates that don't apply are cleared when you
            switch, so nothing unusable is sent.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "SALE", label: "Sell it" },
              { value: "RENT", label: "Rent it out" },
              { value: "BOTH", label: "Both" },
            ] as const
          ).map((option) => (
            <Chip
              key={option.value}
              active={values.listingType === option.value}
              onClick={() => changeListingType(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        {error("listingType") && (
          <p className="text-xs font-semibold text-destructive">{error("listingType")}</p>
        )}

        {sells && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Purchase price (₹)"
              htmlFor={`${uid}-purchase`}
              error={error("purchasePrice")}
            >
              <Input
                id={`${uid}-purchase`}
                inputMode="decimal"
                value={values.purchasePrice}
                onChange={(event) => update("purchasePrice", event.target.value)}
                placeholder="4500"
              />
            </Field>

            {values.rentToOwnEnabled && (
              <Field
                label="Rent-to-own price (₹)"
                htmlFor={`${uid}-rto`}
                error={error("rentToOwnPrice")}
                hint="What a renter pays at the end to keep it."
              >
                <Input
                  id={`${uid}-rto`}
                  inputMode="decimal"
                  value={values.rentToOwnPrice}
                  onChange={(event) => update("rentToOwnPrice", event.target.value)}
                  placeholder="3500"
                />
              </Field>
            )}
          </div>
        )}

        {sells && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.rentToOwnEnabled}
              onChange={(event) => update("rentToOwnEnabled", event.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-[var(--primary)]"
            />
            <span>
              Allow rent-to-own
              <span className="block text-xs text-muted-foreground">
                Renters can apply their rental payments towards buying it.
              </span>
            </span>
          </label>
        )}

        {rental && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Rent per day (₹)"
                htmlFor={`${uid}-rent-day`}
                error={error("rentalPricePerDay")}
              >
                <Input
                  id={`${uid}-rent-day`}
                  inputMode="decimal"
                  value={values.rentalPricePerDay}
                  onChange={(event) => update("rentalPricePerDay", event.target.value)}
                  placeholder="300"
                />
              </Field>
              <Field
                label="Per week (₹)"
                htmlFor={`${uid}-rent-week`}
                error={error("rentalPricePerWeek")}
                hint="Optional"
              >
                <Input
                  id={`${uid}-rent-week`}
                  inputMode="decimal"
                  value={values.rentalPricePerWeek}
                  onChange={(event) => update("rentalPricePerWeek", event.target.value)}
                  placeholder="1800"
                />
              </Field>
              <Field
                label="Per month (₹)"
                htmlFor={`${uid}-rent-month`}
                error={error("rentalPricePerMonth")}
                hint="Optional"
              >
                <Input
                  id={`${uid}-rent-month`}
                  inputMode="decimal"
                  value={values.rentalPricePerMonth}
                  onChange={(event) => update("rentalPricePerMonth", event.target.value)}
                  placeholder="5500"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Security deposit (₹)"
                htmlFor={`${uid}-deposit`}
                error={error("securityDeposit")}
                hint="Refunded on return."
              >
                <Input
                  id={`${uid}-deposit`}
                  inputMode="decimal"
                  value={values.securityDeposit}
                  onChange={(event) => update("securityDeposit", event.target.value)}
                  placeholder="5000"
                />
              </Field>
              <Field
                label="Minimum rental (days)"
                htmlFor={`${uid}-min-days`}
                error={error("minimumRentalDays")}
              >
                <Input
                  id={`${uid}-min-days`}
                  inputMode="numeric"
                  value={values.minimumRentalDays}
                  onChange={(event) => update("minimumRentalDays", event.target.value)}
                  placeholder="7"
                />
              </Field>
              <Field
                label="Maximum rental (days)"
                htmlFor={`${uid}-max-days`}
                error={error("maximumRentalDays")}
              >
                <Input
                  id={`${uid}-max-days`}
                  inputMode="numeric"
                  value={values.maximumRentalDays}
                  onChange={(event) => update("maximumRentalDays", event.target.value)}
                  placeholder="90"
                />
              </Field>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor={`${uid}-location`} error={error("location")}>
            <Input
              id={`${uid}-location`}
              value={values.location}
              maxLength={120}
              onChange={(event) => update("location", event.target.value)}
              placeholder="Koramangala, Bengaluru"
            />
          </Field>
          <Field
            label="How many do you have?"
            htmlFor={`${uid}-quantity`}
            error={error("quantity")}
            hint="You can change stock any time from your listings."
          >
            <Input
              id={`${uid}-quantity`}
              inputMode="numeric"
              value={values.quantity}
              onChange={(event) => update("quantity", event.target.value)}
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">How do buyers get it?</legend>
          <div className="flex flex-wrap gap-4">
            <Check
              label="Delivery"
              checked={values.allowsDelivery}
              onChange={(checked) => update("allowsDelivery", checked)}
            />
            <Check
              label="Collection"
              checked={values.allowsPickup}
              onChange={(checked) => update("allowsPickup", checked)}
            />
          </div>
          {error("allowsPickup") && (
            <p className="mt-1 text-xs font-semibold text-destructive">{error("allowsPickup")}</p>
          )}
        </fieldset>

        <Field
          label="Search tags"
          htmlFor={`${uid}-tags`}
          error={error("tags")}
          hint="Comma-separated. Helps the right buyer find it."
        >
          <Input
            id={`${uid}-tags`}
            value={values.tags}
            onChange={(event) => update("tags", event.target.value)}
            placeholder="teak, writing desk, vintage"
          />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 size={15} aria-hidden className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save size={15} aria-hidden />
              {submitLabel ?? (mode === "create" ? "Save as draft" : "Save changes")}
            </>
          )}
        </Button>
        {mode === "create" && (
          <p className="text-xs text-muted-foreground">
            New listings start as a draft. Publish it from your listings when you're ready.
          </p>
        )}
      </div>
    </form>
  );
}

/* --------------------------------- pieces ---------------------------------- */

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "primary-button text-primary-foreground"
          : "inset-surface text-foreground hover:bg-primary/10",
      )}
    >
      {children}
    </button>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-border accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}
