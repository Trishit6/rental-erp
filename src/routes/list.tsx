import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/list` — kept as a redirect, deliberately.
 *
 * This path had a dedicated listing wizard at `/dashboard/products/new`, and the
 * nav, the empty states and the product page all link here. Removing the route
 * would break eight links across the app to gain nothing; a redirect keeps every
 * one of them working and puts the seller on the real form.
 *
 * `beforeLoad` rather than a `loader` redirect: the guard has to run first. An
 * unauthenticated visitor following a "sell this" link should land on login and
 * be returned here afterwards, not bounce straight to a listing form whose first
 * request would 403.
 */
export const Route = createFileRoute("/list")({
  beforeLoad: ({ context, location }) => {
    requireSeller({ context, location });
    throw redirect({ to: "/dashboard/products/new" });
  },
});