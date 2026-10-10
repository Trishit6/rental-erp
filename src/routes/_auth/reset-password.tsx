import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/features/auth";

type ResetSearch = { token?: string };

/**
 * `/_auth/reset-password?token=…`
 *
 * The layout's `requireGuest` guard applies, and the token is read from the
 * search params the same way `/login` reads `redirect` — never from the URL
 * path or a form field, so a link that was mangled in transit fails cleanly.
 */
export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});