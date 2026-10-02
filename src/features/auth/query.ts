import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, privateQueryKeys } from "@/lib/query/keys";
import { clearPrivateCollections } from "@/lib/tanstack-db";
import { getCurrentUser, login, logout, register } from "./api";
import type { LoginPayload, RegisterPayload, User } from "./types";

/**
 * The single source of truth for authentication state.
 * Server-side session + httpOnly cookie mean this survives page refreshes;
 * staleTime keeps it from refetching on every navigation.
 */
export function authMeQuery() {
  return {
    queryKey: queryKeys.auth,
    queryFn: getCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
  };
}

export function useCurrentUser() {
  return useQuery(authMeQuery());
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (user: User) => {
      // Seed the cache directly — no refetch needed after login.
      queryClient.setQueryData(queryKeys.auth, user);
    },
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
    onSuccess: (user: User) => {
      queryClient.setQueryData(queryKeys.auth, user);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      // Evict ALL private user-scoped cache entries; public data stays cached.
      for (const key of privateQueryKeys) {
        queryClient.removeQueries({ queryKey: key });
      }
      // The TanStack DB collections are the *other* private store. Evicting the
      // query cache alone would leave the previous customer's orders, lines and
      // rentals readable in the reactive store for whoever signs in next, so the
      // two are wiped together on the same path.
      clearPrivateCollections();
      // Reset auth to an explicit unauthenticated state rather than leaving
      // cached user data behind.
      queryClient.setQueryData(queryKeys.auth, null);
    },
  });
}
