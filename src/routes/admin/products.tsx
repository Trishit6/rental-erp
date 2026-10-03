import { createFileRoute } from "@tanstack/react-router";
import { AdminProductsPage } from "@/features/admin";

/** `/admin/products` — the catalogue. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/products")({
  component: AdminProductsPage,
});
