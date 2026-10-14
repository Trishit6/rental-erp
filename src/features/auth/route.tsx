import { useSearch } from "@tanstack/react-router";
import { LoginPage, RegisterPage } from "./index";
import { getPostAuthTarget } from "@/lib/auth/guards";

/**
 * The login route, wired to the `_auth` layout's `?redirect=` search param.
 *
 * ## Why the value is resolved here rather than in the form
 *
 * `redirect` arrives in the URL, so it is whatever a link chose to put there.
 * `getPostAuthTarget` refuses anything that is not one of our own paths (an absolute
 * URL, a protocol-relative `//host`, a backslash form, an encoded variant of any of
 * those, `/login` itself) and falls back to `/dashboard`. Validating at the boundary
 * means the dangerous string never reaches the form. The form runs the same function
 * again — it is idempotent — and navigates with `replace`, so Back does not return to
 * the login page the user just left.
 */
export function LoginRoute() {
  const { redirect } = useSearch({ from: "/_auth/login" });
  return <LoginPage redirectTo={getPostAuthTarget(redirect)} />;
}

export { RegisterPage };
