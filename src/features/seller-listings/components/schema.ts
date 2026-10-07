import { z } from "zod";
import { rupeesToPaise } from "@/lib/pricing";
import {
  DEFAULT_SELLER_PRODUCT_FILTERS,
  LISTING_MODES,
  PRODUCT_CONDITIONS,
  SELLER_PRODUCT_SORTS,
  STATUS_LABELS,
  STOCK_FILTERS,
  type ListingMode,
  type ProductCondition,
  type ProductPayload,
  type SellerProductFilters,
  type SellerProductSort,
  type SellerProductStatus,
  type StockFilter,
} from "../types";

/**
 * The product form's schema, kept out of the component so it can be unit-tested
 * without rendering anything.
 *
 * ## Why the conditional rules live in `superRefine`
 *
 * Nearly every rule here is *conditional on another field*: a rental listing
 * needs a rental price and must not carry a purchase price; a sale-only listing
 * must not carry a security deposit; a rental window needs a minimum below its
 * maximum. Those are cross-field, so they cannot be expressed by a field's own
 * validator — but they are still the form's job to catch, because the whole point
 * of validating in the browser is to say what is wrong *before* the round trip.
 *
 * The server applies the same rules again, independently, in
 * `server/lib/product-validation.ts`. That duplication is deliberate and is not
 * drift: the two run against different shapes (form strings here, the merged row
 * there), and a client is a convenience while the server is the guarantee.
 *
 * ## Prices are rupees in the form, paise on the wire
 *
 * The form collects rupees because that is what a seller types. `toPayload` is
 * the one place the conversion happens. Checkout **totals** are a different
 * matter and stay server-side (`server/lib/checkout.ts`); a listing price is a
 * seller-set attribute, not an amount the marketplace computes.
 */

/** Longest a title may be — `products.title` is `varchar(120)`. */
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;
export const BRAND_MAX = 80;
export const LOCATION_MAX = 120;
/** `products.quantity` is an `int`; the API caps it at 999. */
export const QUANTITY_MAX = 999;

/**
 * Images per listing.
 *
 * Mirrors `MAX_IMAGES_PER_LISTING` in `server/lib/storage/types.ts`, which the
 * server enforces on write. Kept as a literal here because the server module is
 * outside the app tsconfig; `tests/seller-product-schema.test.ts` asserts the two
 * agree, the same way the listing-status vocabulary is checked in
 * `tests/listing-status.test.ts`.
 */
export const PRODUCT_IMAGES_MAX = 8;

export type ProductFormValues = {
  title: string;
  description: string;
  /** Category id as a string, or `""` when nothing is chosen. */
  categoryId: string;
  brand: string;
  condition: ProductCondition;
  listingType: "SALE" | "RENT" | "BOTH";
  location: string;
  purchasePrice: string;
  rentalPricePerDay: string;
  rentalPricePerWeek: string;
  rentalPricePerMonth: string;
  securityDeposit: string;
  minimumRentalDays: string;
  maximumRentalDays: string;
  rentToOwnEnabled: boolean;
  rentToOwnPrice: string;
  quantity: string;
  images: string[];
  tags: string;
  allowsDelivery: boolean;
  allowsPickup: boolean;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  title: "",
  description: "",
  categoryId: "",
  brand: "",
  condition: "GOOD",
  listingType: "SALE",
  location: "",
  purchasePrice: "",
  rentalPricePerDay: "",
  rentalPricePerWeek: "",
  rentalPricePerMonth: "",
  securityDeposit: "",
  minimumRentalDays: "",
  maximumRentalDays: "",
  rentToOwnEnabled: false,
  rentToOwnPrice: "",
  quantity: "1",
  images: [],
  tags: "",
  allowsDelivery: true,
  allowsPickup: true,
};

/** A blank, non-negative decimal. `""` passes; `"abc"` and `"-5"` do not. */
const rupees = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Enter an amount in rupees, like 1500 or 1500.50.",
  });

/** A whole number, or blank. Used for durations and stock. */
const wholeNumber = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,4}$/.test(value), {
    message: "Enter a whole number.",
  });

export const productFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Give the listing a title of at least 3 characters.")
      .max(TITLE_MAX),
    description: z
      .string()
      .trim()
      .min(10, "Describe the item in at least 10 characters — buyers decide on this.")
      .max(DESCRIPTION_MAX),
    categoryId: z.string().trim().min(1, "Choose a category."),
    brand: z.string().trim().max(BRAND_MAX).optional(),
    condition: z.enum(PRODUCT_CONDITIONS),
    listingType: z.enum(["SALE", "RENT", "BOTH"]),
    location: z.string().trim().min(2, "Where is the item?").max(LOCATION_MAX),
    purchasePrice: rupees,
    rentalPricePerDay: rupees,
    rentalPricePerWeek: rupees,
    rentalPricePerMonth: rupees,
    securityDeposit: rupees,
    minimumRentalDays: wholeNumber,
    maximumRentalDays: wholeNumber,
    rentToOwnEnabled: z.boolean(),
    rentToOwnPrice: rupees,
    quantity: wholeNumber.refine((value) => value !== "", {
      message: "Say how many you have.",
    }),
    images: z.array(z.string().url("That image address isn't valid.")).max(PRODUCT_IMAGES_MAX),
    tags: z.string().trim().max(200),
    allowsDelivery: z.boolean(),
    allowsPickup: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const sells = values.listingType === "SALE" || values.listingType === "BOTH";
    const rents = values.listingType === "RENT" || values.listingType === "BOTH";

    if (sells && !(Number(values.purchasePrice) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["purchasePrice"],
        message: "A listing for sale needs a purchase price above zero.",
      });
    }
    if (!sells && Number(values.purchasePrice) > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["purchasePrice"],
        message: "A rental-only listing cannot carry a purchase price.",
      });
    }

    if (rents && !(Number(values.rentalPricePerDay) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["rentalPricePerDay"],
        message: "A listing for rent needs a daily rental price above zero.",
      });
    }
    if (!rents && Number(values.rentalPricePerDay) > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rentalPricePerDay"],
        message: "A sale-only listing cannot carry a rental price.",
      });
    }

    if (!rents && Number(values.securityDeposit) > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["securityDeposit"],
        message: "A sale-only listing cannot hold a security deposit.",
      });
    }

    const min = values.minimumRentalDays;
    const max = values.maximumRentalDays;
    if ((min === "") !== (max === "")) {
      ctx.addIssue({
        code: "custom",
        path: [min === "" ? "minimumRentalDays" : "maximumRentalDays"],
        message: "Set both a minimum and a maximum rental duration, or neither.",
      });
    } else if (min !== "" && max !== "") {
      if (Number(min) < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["minimumRentalDays"],
          message: "The minimum rental duration must be at least one day.",
        });
      }
      if (Number(max) < Number(min)) {
        ctx.addIssue({
          code: "custom",
          path: ["maximumRentalDays"],
          message: "The maximum rental duration must be at least the minimum.",
        });
      }
    }

    if (values.rentToOwnEnabled && !(Number(values.rentToOwnPrice) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["rentToOwnPrice"],
        message: "Rent-to-own needs the price the renter pays to keep the item.",
      });
    }
    if (!sells && values.rentToOwnEnabled) {
      ctx.addIssue({
        code: "custom",
        path: ["rentToOwnEnabled"],
        message: "Rent-to-own only applies to items that can also be bought.",
      });
    }

    if (Number(values.quantity) < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "A new listing must start with at least one unit.",
      });
    } else if (Number(values.quantity) > QUANTITY_MAX) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: `That is more than ${QUANTITY_MAX} units.`,
      });
    }

    if (!values.allowsDelivery && !values.allowsPickup) {
      ctx.addIssue({
        code: "custom",
        path: ["allowsPickup"],
        message: "Let buyers collect it, have it delivered, or both.",
      });
    }
  });

export type ProductFormIssue = { path: string; message: string };

/** Flatten a `ZodError` into `{ path, message }` for per-field rendering. */
export function productFormIssues(error: z.ZodError): ProductFormIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** The first message for one field, or `""`. */
export function issueFor(issues: ProductFormIssue[], path: string): string {
  return issues.find((issue) => issue.path === path)?.message ?? "";
}

/** Rupees → paise, or `null` for a blank field. */
function toPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return rupeesToPaise(Number(trimmed));
}

/** Whole number, or `null` for a blank field. */
function toInt(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** Comma- or newline-separated tags, lower-cased, de-duplicated, capped. */
export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0 && tag.length <= 30),
    ),
  ].slice(0, 10);
}

/**
 * Form values → the API body.
 *
 * Only called once `productFormSchema` has passed, so every conversion here is
 * total. The result is the *whole* listing on create and a full replacement on
 * edit, because the server's `PATCH` semantics for `images` and `tags` are
 * replace-wholesale — a partial send would be ambiguous about whether a missing
 * list means "leave alone" or "remove them".
 */
export function toPayload(values: ProductFormValues): ProductPayload {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    categoryId: Number(values.categoryId),
    brand: values.brand.trim() || undefined,
    condition: values.condition,
    listingType: values.listingType,
    location: values.location.trim(),
    purchasePrice: toPaise(values.purchasePrice),
    rentalPricePerDay: toPaise(values.rentalPricePerDay),
    rentalPricePerWeek: toPaise(values.rentalPricePerWeek),
    rentalPricePerMonth: toPaise(values.rentalPricePerMonth),
    securityDeposit: toPaise(values.securityDeposit),
    minimumRentalDays: toInt(values.minimumRentalDays),
    maximumRentalDays: toInt(values.maximumRentalDays),
    rentToOwnEnabled: values.rentToOwnEnabled,
    rentToOwnPrice: toPaise(values.rentToOwnPrice),
    rentCreditPercentage: null,
    rentCreditCap: null,
    quantity: Number(values.quantity),
    images: values.images,
    tags: parseTags(values.tags),
    allowsDelivery: values.allowsDelivery,
    allowsPickup: values.allowsPickup,
  };
}

/** Paise → the rupees string a text input shows. */
export function fromPaise(paise: number | null | undefined): string {
  return paise === null || paise === undefined ? "" : String(paise / 100);
}

/** The form as it should look when editing an existing listing. */
export function toFormValues(detail: {
  title: string;
  description: string;
  categoryId: number;
  brand: string | null;
  condition: string;
  listingType: string;
  location: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  rentToOwnEnabled: boolean;
  rentToOwnPrice: number | null;
  quantity: number;
  images: { url: string }[];
  tags: string[];
  allowsDelivery: boolean;
  allowsPickup: boolean;
}): ProductFormValues {
  return {
    title: detail.title,
    description: detail.description,
    categoryId: String(detail.categoryId),
    brand: detail.brand ?? "",
    condition: (PRODUCT_CONDITIONS as readonly string[]).includes(detail.condition)
      ? (detail.condition as ProductCondition)
      : "GOOD",
    listingType:
      detail.listingType === "RENT" || detail.listingType === "BOTH" ? detail.listingType : "SALE",
    location: detail.location,
    purchasePrice: fromPaise(detail.purchasePrice),
    rentalPricePerDay: fromPaise(detail.rentalPricePerDay),
    rentalPricePerWeek: fromPaise(detail.rentalPricePerWeek),
    rentalPricePerMonth: fromPaise(detail.rentalPricePerMonth),
    securityDeposit: fromPaise(detail.securityDeposit),
    minimumRentalDays: detail.minimumRentalDays === null ? "" : String(detail.minimumRentalDays),
    maximumRentalDays: detail.maximumRentalDays === null ? "" : String(detail.maximumRentalDays),
    rentToOwnEnabled: detail.rentToOwnEnabled,
    rentToOwnPrice: fromPaise(detail.rentToOwnPrice),
    quantity: String(detail.quantity),
    images: detail.images.map((image) => image.url),
    tags: detail.tags.join(", "),
    allowsDelivery: detail.allowsDelivery,
    allowsPickup: detail.allowsPickup,
  };
}

/**
 * Whether the rental section is on screen.
 *
 * Exported so the form and its tests agree on what "a rental listing" means,
 * instead of the component re-deriving `listingType === "RENT" || "BOTH"` in
 * three places.
 */
export function showsRentalFields(listingType: ProductFormValues["listingType"]): boolean {
  return listingType === "RENT" || listingType === "BOTH";
}

/** Whether the purchase-price field is on screen. Same reasoning. */
export function showsPurchasePrice(listingType: ProductFormValues["listingType"]): boolean {
  return listingType === "SALE" || listingType === "BOTH";
}

/* -------------------------------- URL state -------------------------------- */

/**
 * The listings page's URL state, as TanStack Router sees it.
 *
 * ## Why every field is optional
 *
 * Not a convenience — a requirement of the router. When `validateSearch` returns
 * a type whose fields are all *required*, TanStack Router marks `search` as
 * required on that route and, worse, propagates that requirement to its **child**
 * routes. So `/seller/products` would make `search` mandatory on
 * `/seller/products/new` too, and every `<Link>` to the create form would need
 * `search={{}}` — a list of empty filters carried around purely to satisfy a type
 * system that is describing a URL, where every parameter genuinely can be absent.
 *
 * So the split is: `SellerProductsSearch` (optional, what the URL holds) and
 * `SellerProductFilters` (total, what the page and the request use).
 * `resolveSellerProductFilters` is the only bridge, and it fills every default.
 *
 * ## Degrades rather than throws
 *
 * Every value arrives from a URL a seller can edit, share and paste.
 * `?page=banana` is page 1, `?sort=cheapest` is `newest`, and
 * `?status=NEVER_HEARD_OF_IT` shows everything rather than replacing the page
 * with an error boundary. Note that TanStack Router **JSON-parses** search params,
 * so `?page=2` arrives as the number `2` and a `z.coerce` has to accept both
 * shapes.
 *
 * This is a courtesy that keeps obviously-wrong requests from leaving the browser,
 * not a security boundary: `server/lib/seller-product-queries.ts` re-validates
 * the same vocabulary and scopes every query to the session's seller id.
 */
export type SellerProductsSearch = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  type?: string;
  stock?: string;
  sort?: string;
};

/** Raw → URL state, narrowed to the vocabularies and throwing away the rest. */
export const sellerProductsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.string().trim().optional().catch(undefined),
  type: z.string().trim().optional().catch(undefined),
  stock: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
});

/** Used as the route's `validateSearch`. */
export function parseSellerProductsSearch(search: Record<string, unknown>): SellerProductsSearch {
  const parsed = sellerProductsSearchSchema.parse(search ?? {});
  return {
    ...(parsed.page !== undefined ? { page: parsed.page } : {}),
    ...(parsed.pageSize !== undefined ? { pageSize: parsed.pageSize } : {}),
    ...(parsed.q !== undefined ? { q: parsed.q } : {}),
    ...(parsed.status !== undefined && isSellerProductStatus(parsed.status)
      ? { status: parsed.status }
      : {}),
    ...(parsed.type !== undefined && isListingMode(parsed.type) ? { type: parsed.type } : {}),
    ...(parsed.stock !== undefined && isStockFilter(parsed.stock) ? { stock: parsed.stock } : {}),
    ...(parsed.sort !== undefined && isSellerProductSort(parsed.sort) ? { sort: parsed.sort } : {}),
  };
}

/** URL state → the total filter object the page and the API use. */
export function resolveSellerProductFilters(search: SellerProductsSearch): SellerProductFilters {
  return {
    page: search.page ?? DEFAULT_SELLER_PRODUCT_FILTERS.page,
    pageSize: search.pageSize ?? DEFAULT_SELLER_PRODUCT_FILTERS.pageSize,
    search: search.q ?? "",
    status: (search.status as SellerProductStatus) ?? "",
    listingType: (search.type as ListingMode) ?? "",
    stock: (search.stock as StockFilter) ?? "",
    sort: (search.sort as SellerProductSort) ?? DEFAULT_SELLER_PRODUCT_FILTERS.sort,
  };
}

/**
 * Filters → the URL shape above.
 *
 * Defaults are **omitted** rather than written out, so a link to an unfiltered
 * list is a clean `/seller/products` and the seller never sends a colleague a
 * URL full of parameters that all mean "no filter".
 */
export function toSearchParams(filters: SellerProductFilters): SellerProductsSearch {
  const params: SellerProductsSearch = {};
  if (filters.page > 1) params.page = filters.page;
  if (filters.pageSize !== 20) params.pageSize = filters.pageSize;
  if (filters.search) params.q = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.listingType) params.type = filters.listingType;
  if (filters.stock) params.stock = filters.stock;
  if (filters.sort !== "newest") params.sort = filters.sort;
  return params;
}

function isSellerProductStatus(value: string): value is SellerProductStatus {
  return value in STATUS_LABELS;
}

function isListingMode(value: string): value is ListingMode {
  return (LISTING_MODES as readonly string[]).includes(value);
}

function isStockFilter(value: string): value is StockFilter {
  return (STOCK_FILTERS as readonly string[]).includes(value);
}

function isSellerProductSort(value: string): value is SellerProductSort {
  return (SELLER_PRODUCT_SORTS as readonly string[]).includes(value);
}
