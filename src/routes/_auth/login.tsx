import { createFileRoute } from "@tanstack/react-router";
import { LoginRoute } from "@/features/auth/route";

export const Route = createFileRoute("/_auth/login")({
  component: LoginRoute,
});
