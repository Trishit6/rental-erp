import { createFileRoute } from "@tanstack/react-router";
import { AdminContentPage } from "@/features/admin";

/** `/admin/content` — the CMS (banners, homepage blocks). Guarded by the parent layout. */
export const Route = createFileRoute("/admin/content")({
  component: AdminContentPage,
});
