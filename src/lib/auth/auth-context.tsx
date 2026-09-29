import { createContext, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query/keys";
import { api } from "../api/client";
import { authMeQuery, useCurrentUser } from "@/features/auth/query";

export type { AuthRole } from "@/features/auth/types";
import type { User } from "@/features/auth/types";

/** The router-context/legacy user shape. */
export type AuthUser = User;

type AuthContextValue = {
  user: AuthUser | null;
  /** True while the initial session is still being resolved — gate protected UI on this. */
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useCurrentUser();
  const queryClient = useQueryClient();

  async function refresh() {
    await queryClient.fetchQuery({
      queryKey: queryKeys.auth,
      queryFn: () => api.get<User>("/auth/me").then((r) => r.data),
    });
  }

  const user = data ?? null;
  const value: AuthContextValue = {
    user,
    loading: isLoading,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export { authMeQuery };
