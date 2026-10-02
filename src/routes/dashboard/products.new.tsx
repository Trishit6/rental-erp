import { createFileRoute } from "@tanstack/react-router";
import { NewProductPage } from "@/features/seller-listings/form-pages";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/products/new` — create a listing.
 *
 * This is where `/list` now points. The old six-step wizard at `/list` was a
 * *second* way to create a listing, with its own validation, no photo upload and
 * no draft state; having one form means the pricing and rental rules are stated
 * once (`components/schema.ts` on the client, `product-validation.ts` on the
 * server) instead of twice and drifting.
 */
export const Route = createFileRoute("/dashboard/products/new")({
  beforeLoad: requireSeller,
  component: NewProductPage,
});