import { createFileRoute } from "@tanstack/react-router";
import { EditProductPage } from "@/features/seller-listings/form-pages";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/products/$productId/edit` — edit a listing.
 *
 * Named as a flat file, `products.$productId.edit.tsx`, to match its siblings
 * `products.tsx` and `products.new.tsx`. It previously lived at
 * `products./$productId.edit.tsx` — a *directory* whose name ended in a dot, which
 * the generator happened to collapse to the same `products` segment and so produced
 * the correct route. That worked only by coincidence: on Windows the trailing dot is
 * not addressable through the normal API, the directory could not be removed with
 * `Remove-Item`, and `git status` could not read it. The flat name resolves to the
 * identical route id and path.
 *
 * `requireSeller` is the friendly half; `requireSeller` in
 * `server/lib/seller-access.ts` is the authoritative one. A listing is the seller's,
 * so this must never be reachable by a customer.
 */
export const Route = createFileRoute("/dashboard/products/$productId/edit")({
  beforeLoad: requireSeller,
  component: EditProductPage,
});