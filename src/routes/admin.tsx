import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/features/admin";
import { requireAdmin } from "@/lib/auth/guards";

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAdmin,
  component: AdminPage,
});
