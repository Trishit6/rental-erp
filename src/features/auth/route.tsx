import { useSearch } from "@tanstack/react-router";
import { LoginPage, RegisterPage } from "./index";

export function LoginRoute() {
  const { redirect } = useSearch({ from: "/_auth/login" });
  return <LoginPage redirectTo={redirect ?? "/dashboard"} />;
}

export { RegisterPage };
