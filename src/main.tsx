import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { router } from "./router";
import { createQueryClient } from "./lib/query/client";
import { AppProviders } from "./lib/query/providers";
import { AuthProvider, useAuth } from "./lib/auth/auth-context";
import { ThemeProvider } from "./lib/theme";
import { AuthGate } from "./components/shared/auth-gate";
import "./styles.css";

const queryClient = createQueryClient();

function RouterWithAuth() {
  const { user, loading } = useAuth();

  // Never guess auth state: hold the whole router until the session resolves.
  if (loading) {
    return <AuthGate />;
  }

  return <RouterProvider router={router} context={{ user, queryClient }} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders queryClient={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RouterWithAuth />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--color-card)",
                color: "var(--color-foreground)",
                border: "1px solid var(--raised-border)",
                // `--elev-modal-shadow`, not a hand-written pair. This toast
                // declared a 9px/24px blur — a bigger spread than any rung in the
                // elevation ladder (the largest is 4px/16px) — so every transient
                // notification was the most heavily shadowed object on the screen,
                // which is exactly the "blooming" the stylesheet warns against.
                boxShadow: "var(--elev-modal-shadow)",
                borderRadius: "1rem",
                fontFamily: '"DM Sans", sans-serif',
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </AppProviders>
  </React.StrictMode>,
);
