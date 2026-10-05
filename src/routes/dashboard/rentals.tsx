import { createFileRoute } from "@tanstack/react-router";
import { DashboardRentalsPage } from "@/features/seller-rentals";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/rentals` — rentals of this seller's own listings.
 *
 * `requireSeller` rather than `requireAuth`. This page reads `GET /rentals?role=all`, which
 * returns every rental the caller is a party to — *both* sides of the table, including the
 * ones where they are the renter rather than the owner. Shown on a page labelled as the
 * seller's rental income, that is a customer's own rental history rendered as though the
 * seller had earned from it.
 */
export const Route = createFileRoute("/dashboard/rentals")({
  beforeLoad: requireSeller,
  component: DashboardRentalsPage,
});