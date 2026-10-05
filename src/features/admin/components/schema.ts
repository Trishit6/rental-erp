import { z } from "zod";
import { paiseToRupees, rupeesToPaise } from "@/lib/pricing";

/**
 * The admin catalogue edit form.
 *
 * ## Why the form has its own schema when the server has one too
 *
 * The server's `adminProductEditSchema` is the authority — it is what decides
 * whether a change is legal, and `assertProductPricing` runs after the patch is
 * merged onto the stored row. This schema exists for a different job: turning what
 * a person typed into that shape, and saying so *before* the request is made. It
 * must never be more permissive than the server or a form will happily submit
 * something that comes back as a 400.
 *
 * ## Why prices are strings here and paise on the wire
 *
 * A money `<input type="number">` hands back a number that has already been
 * through `parseFloat`, so `""`, `"12."` and `"12abc"` all collapse into `12`,
 * `12` and `NaN` respectively — a half-typed price silently becomes a valid one.
 * `z.string()` keeps the raw text, and the refinement below rejects it while it is
 * still visibly incomplete. The conversion to paise happens once, in
 * `toAdminProductPayload`.
 */

/** A rupee amount as typed. Accepts `1200`, `1200.50`, `1,200.50`. */
const rupeesField = z
  .string()
  .trim()
  .transform((value) => value.replace(/,/g, ""))
  .refine(
    (value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value),
    "Enter an amount like 1200 or 1200.50.",
  );

/** How the admin edit form reads a listing before any edits. */
export const adminProductFormSchema = z
  .object({
    title: z.string().trim().min(3, "Title needs at least 3 characters.").max(120),
    description: z
      .string()
      .trim()
      .min(10, "Description needs at least 10 characters.")
      .max(5000),
    categoryId: z.number().int().positive("Choose a category."),
    listingType: z.enum(["SALE", "RENT", "BOTH"]),
    purchasePrice: rupeesField,
    rentalPricePerDay: rupeesField,
    rentalPricePerWeek: rupeesField,
    rentalPricePerMonth: rupeesField,
    securityDeposit: rupeesField,
    minimumRentalDays: z.string().trim(),
    maximumRentalDays: z.string().trim(),
    quantity: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "Stock must be at least 1."),
    availableQuantity: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v), "Available stock must be a whole number."),
    status: z.string().min(1),
    allowsDelivery: z.boolean(),
    allowsPickup: z.boolean(),
  })
  // The cross-field rules, in the order a person would say them out loud.
  // These deliberately mirror `server/lib/product-validation.ts` — that file is
  // the authority, and this is the same sentence spoken earlier so the admin is
  // not told "invalid" by a server after filling in a long form.
  .superRefine((values, ctx) => {
    const sells = values.listingType === "SALE" || values.listingType === "BOTH";
    const rents = values.listingType === "RENT" || values.listingType === "BOTH";
    const sale = Number(values.purchasePrice);
    const day = Number(values.rentalPricePerDay);

    if (sells && !(sale > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchasePrice"],
        message: "A listing for sale needs a purchase price above zero.",
      });
    }
    if (!sells && sale > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchasePrice"],
        message: "A rental-only listing cannot carry a purchase price.",
      });
    }
    if (rents && !(day > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rentalPricePerDay"],
        message: "A listing for rent needs a daily rental price above zero.",
      });
    }
    if (!rents && day > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rentalPricePerDay"],
        message: "A sale-only listing cannot carry a rental price.",
      });
    }

    const min = values.minimumRentalDays.trim();
    const max = values.maximumRentalDays.trim();
    if ((min === "") !== (max === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [min === "" ? "minimumRentalDays" : "maximumRentalDays"],
        message: "Set both a minimum and a maximum rental duration, or neither.",
      });
    } else if (min !== "" && max !== "") {
      const lo = Number(min);
      const hi = Number(max);
      if (!Number.isInteger(lo) || lo < 1 || !Number.isInteger(hi) || hi < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minimumRentalDays"],
          message: "Rental durations are whole days, at least 1.",
        });
      } else if (hi < lo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maximumRentalDays"],
          message: "Maximum must be at least the minimum.",
        });
      }
    }

    if (Number(values.availableQuantity) > Number(values.quantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availableQuantity"],
        message: "Available stock cannot be more than the total you stock.",
      });
    }

    if (!values.allowsDelivery && !values.allowsPickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allowsDelivery"],
        message: "A listing must be available for delivery or pickup.",
      });
    }
  });

export type AdminProductFormValues = z.infer<typeof adminProductFormSchema>;

/**
 * Paise for the wire, or `null` for "not set".
 *
 * `null` rather than `0`: the columns are nullable and `0` is a *different* answer
 * — "this listing is free" — while an empty box means "this listing has no
 * purchase price". Sending `0` would let a free listing through and then fail the
 * server's "above zero" rule for a sale listing.
 */
function toPaiseOrNull(rupees: string): number | null {
  const cleaned = rupees.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  return rupeesToPaise(Number(cleaned));
}

/** The request body, in paise and typed ids — exactly what the server accepts. */
export function toAdminProductPayload(values: AdminProductFormValues) {
  const min = values.minimumRentalDays.trim();
  const max = values.maximumRentalDays.trim();
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    categoryId: values.categoryId,
    listingType: values.listingType,
    purchasePrice: toPaiseOrNull(values.purchasePrice),
    rentalPricePerDay: toPaiseOrNull(values.rentalPricePerDay),
    rentalPricePerWeek: toPaiseOrNull(values.rentalPricePerWeek),
    rentalPricePerMonth: toPaiseOrNull(values.rentalPricePerMonth),
    securityDeposit: toPaiseOrNull(values.securityDeposit),
    minimumRentalDays: min === "" ? null : Number(min),
    maximumRentalDays: max === "" ? null : Number(max),
    quantity: Number(values.quantity),
    availableQuantity: Number(values.availableQuantity),
    status: values.status,
    allowsDelivery: values.allowsDelivery,
    allowsPickup: values.allowsPickup,
  };
}

/**
 * Paise → the string the input shows.
 *
 * Whole rupees render without decimals (`1200`, not `1200.00`) because that is
 * what prices are entered and read as everywhere else in this app; only a real
 * fractional amount keeps its paise. `null` renders as an empty box, which is what
 * "no purchase price" has to look like for `toPaiseOrNull` to round-trip it.
 */
export function toRupeesInput(paise: number | null): string {
  if (paise === null) return "";
  const rupees = paiseToRupees(paise);
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/** The form's initial state from a stored listing. */
export function toAdminProductFormValues(
  product: {
    title: string;
    description: string;
    categoryId: number;
    listingType: string;
    purchasePrice: number | null;
    rentalPricePerDay: number | null;
    rentalPricePerWeek: number | null;
    rentalPricePerMonth: number | null;
    securityDeposit: number | null;
    minimumRentalDays: number | null;
    maximumRentalDays: number | null;
    quantity: number;
    availableQuantity: number;
    status: string;
    allowsDelivery: boolean;
    allowsPickup: boolean;
  },
): AdminProductFormValues {
  return {
    title: product.title,
    description: product.description,
    categoryId: product.categoryId,
    listingType: (product.listingType === "RENT" || product.listingType === "BOTH"
      ? product.listingType
      : "SALE") as AdminProductFormValues["listingType"],
    purchasePrice: toRupeesInput(product.purchasePrice),
    rentalPricePerDay: toRupeesInput(product.rentalPricePerDay),
    rentalPricePerWeek: toRupeesInput(product.rentalPricePerWeek),
    rentalPricePerMonth: toRupeesInput(product.rentalPricePerMonth),
    securityDeposit: toRupeesInput(product.securityDeposit),
    minimumRentalDays: product.minimumRentalDays === null ? "" : String(product.minimumRentalDays),
    maximumRentalDays: product.maximumRentalDays === null ? "" : String(product.maximumRentalDays),
    quantity: String(product.quantity),
    availableQuantity: String(product.availableQuantity),
    status: product.status,
    allowsDelivery: product.allowsDelivery,
    allowsPickup: product.allowsPickup,
  };
}

/** The listing statuses an admin may set, and their labels. */
export const ADMIN_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const ADMIN_LISTING_TYPE_OPTIONS = [
  { value: "SALE", label: "For sale" },
  { value: "RENT", label: "For rent" },
  { value: "BOTH", label: "Sale or rent" },
] as const;
