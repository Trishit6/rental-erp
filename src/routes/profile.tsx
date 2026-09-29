import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/features/profile";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireAuth,
  component: ProfilePage,
});
