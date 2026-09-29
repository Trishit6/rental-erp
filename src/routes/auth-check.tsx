import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { AuthGate } from "@/components/shared/auth-gate";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * Waiting room while the session resolves. As soon as auth state settles,
 * bounce back so the original route's guard re-evaluates with real state.
 */
function AuthCheck() {
  const { loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      void router.invalidate();
      void router.history.back();
    }
  }, [loading, router]);

  return <AuthGate />;
}

export const Route = createFileRoute("/auth-check")({
  component: AuthCheck,
});
