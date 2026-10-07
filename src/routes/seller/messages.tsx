import { createFileRoute } from "@tanstack/react-router";
import { DashboardMessagesPage } from "@/features/messages";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/seller/messages")({
  beforeLoad: requireAuth,
  component: DashboardMessagesPage,
});
