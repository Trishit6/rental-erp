import { createFileRoute } from "@tanstack/react-router";
import { AdminProductImagesPage } from "@/features/admin";

/** `/admin/product-images` — photo sets. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/product-images")({
  component: AdminProductImagesPage,
});