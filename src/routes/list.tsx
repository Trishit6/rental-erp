import { createFileRoute } from "@tanstack/react-router";
import { ListItemPage } from "@/features/sell";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/list")({
  beforeLoad: requireAuth,
  component: ListItemPage,
});
