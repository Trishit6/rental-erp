import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../query/keys";
import { authMeQuery, clearAuthState, useCurrentUser } from "@/features/auth/query";
import { syncAuthUser } from "@/lib/tanstack-db";
import { setSessionExpiredHandler } from "./session-expiry";
import { subscribeToAuthChanges, type AuthChangeEvent } from "./session-sync";

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

  const user = data ?? null;

  /**
   * Mirror the session into TanStack DB — one writer, and it is here.
   *
   * TanStack Query owns fetching, caching and invalidation; TanStack DB holds
   * the safe, reactive projection of the answer so anything that needs to react
   * to *identity* reads one row instead of subscribing to a cache entry. This
   * effect is the whole synchronisation: every path that changes who is signed
   * in — sign-in, sign-out, expiry, another tab, a profile edit that writes the
   * cache directly — ends at `data`, so they all land in the store together.
   *
   * What is written is the sanitized `GET /auth/me` payload and nothing more. No
   * token, no password, no session id: the credentials are in HttpOnly cookies
   * this process cannot read, and the row is a *report* of the server's answer
   * rather than anything that could keep a session alive on its own. Signing out
   * writes `null`, which removes the row outright rather than leaving an
   * `isAuthenticated: false` ghost of the previous customer's details behind.
   */
  useEffect(() => {
    syncAuthUser(user);
  }, [user]);

  /**
   * Guard against announcing the same expiry twice.
   *
   * Several queries fail at once when a session dies — the cart, the unread count, the
   * address book, whatever the current page had mounted. Each raises its own `ApiError`,
   * and without this the user would see the identical toast stacked several deep. The ref
   * flips on the first notice and resets when a real user comes back, so the next genuine
   * expiry is still announced.
   */
  const expiryAnnounced = useRef(false);
  useEffect(() => {
    if (user) expiryAnnounced.current = false;
  }, [user]);

  /**
   * React to the session having died underneath us.
   *
   * Registered as the app's session-expiry handler (see `lib/query/client.ts`), so this
   * runs once per failing *non-auth* query rather than needing a `catch` in every feature.
   *
   * The `getQueryData` check is what makes it safe: an expired session and a visitor who
   * was never signed in produce the same `401`, and only the former deserves a message and
   * a cache wipe. It is checked *before* the ref guard because it is the more fundamental
   * condition — a signed-out visitor has nothing to clear.
   */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!queryClient.getQueryData(queryKeys.auth)) return;
      if (expiryAnnounced.current) return;
      expiryAnnounced.current = true;
      clearAuthState(queryClient);
      toast("Your session has expired. Please sign in again.");
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  /**
   * Follow the session across tabs.
   *
   * A `signed-out` event is acted on directly: the cookie is already gone, so this tab
   * clears too. A `signed-in` event is *refetched* rather than applied, because the event
   * carries no identity by design — `/auth/me` is the only thing allowed to say who this
   * browser is signed in as.
   */
  useEffect(() => {
    return subscribeToAuthChanges((event: AuthChangeEvent) => {
      if (event === "signed-out") {
        if (queryClient.getQueryData(queryKeys.auth)) {
          clearAuthState(queryClient);
          toast("You were signed out in another tab.");
        }
        return;
      }
      void queryClient.refetchQueries({ queryKey: queryKeys.auth });
    });
  }, [queryClient]);

  /**
   * Re-resolve the session from the server.
   *
   * Shares `authMeQuery`'s options rather than repeating them: a second `fetchQuery` with
   * hand-written `queryFn`/`staleTime` is how two copies drift, and the profile save path
   * was already carrying its own ad-hoc one.
   */
  const refresh = useCallback(async () => {
    await queryClient.fetchQuery(authMeQuery());
  }, [queryClient]);

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