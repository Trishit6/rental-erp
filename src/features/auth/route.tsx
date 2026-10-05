import { useSearch } from "@tanstack/react-router";
import { LoginPage, RegisterPage } from "./index";
import { safeRedirect } from "@/lib/auth/guards";

/**
 * The login route, wired to the `_auth` layout's `?redirect=` search param.
 *
 * ## Why the value is sanitised here rather than in the form
 *
 * `redirect` arrives in the URL, so it is whatever a link chose to put there. `safeRedirect`
 * refuses anything that is not one of our own paths (an absolute URL, a protocol-relative
 * `//host`, a backslash form) and falls back to "no destination", which the form then
 * resolves by role. Validating at the boundary means the dangerous string never reaches
 * the form, and the form does not have to remember that it is handling user input.
 *
 * ## Why there is no fallback path in this file
 *
 * The default destination depends on the role, and the role is not known here — this route
 * is guest-only, so anyone who reaches it has no session by definition. `LoginForm` picks
 * it from the user the login response actually returned.
 */
export function LoginRoute() {
  const { redirect } = useSearch({ from: "/_auth/login" });
  return <LoginPage redirectTo={safeRedirect(redirect, "") || undefined} />;
}

export { RegisterPage };