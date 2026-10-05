import { createFileRoute } from "@tanstack/react-router";
import { AdminRentalsPage } from "@/features/admin";

/** `/admin/rentals` — every rental booking. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/rentals")({
  component: AdminRentalsPage,
});