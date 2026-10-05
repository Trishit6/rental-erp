import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys, privateQueryKeys } from "@/lib/query/keys";
import { clearPrivateCollections } from "@/lib/tanstack-db";
import { publishAuthChange } from "@/lib/auth/session-sync";
import {
  changePassword,
  getCurrentUser,
  login,
  logout,
  register,
  updateProfile,
} from "./api";
import type {
  ChangePasswordPayload,
  ChangePasswordResponse,
  LoginPayload,
  ProfileUpdatePayload,
  RegisterPayload,
  User,
} from "./types";

/**
 * The single source of truth for authentication state.
 * Server-side session + httpOnly cookie mean this survives page refreshes;
 * staleTime keeps it from refetching on every navigation.
 */
export function authMeQuery() {
  return {
    queryKey: queryKeys.auth,
    queryFn: getCurrentUser,
    /**
     * Long enough that a shopper paging through listings does not re-ask "who am I" on
     * every navigation. The session is the real expiry — this only bounds how long the
     * *client* may act on a stale answer, and `publishAuthChange` plus window focus both
     * invalidate it early when the truth moves.
     */
    staleTime: 5 * 60_000,
    /**
     * `false` is load-bearing, not a default. A 401 from `/auth/me` is the *expected*
     * answer for every signed-out visitor, so the default single retry would delay the
     * first paint of the whole app by one failed round trip on every cold load.
     */
    retry: false,
  };
}

export function useCurrentUser() {
  return useQuery(authMeQuery());
}

/**
 * Drop every trace of the previous session from the client.
 *
 * ## Why this is one exported function
 *
 * Signing out, having a session expire mid-visit, and being told by another tab that the
 * user signed out are the *same* event as far as the browser is concerned — the session is
 * gone and this device must forget it. Written three times it would be three chances to
 * forget the TanStack DB wipe, which is the half nobody notices is missing: the query cache
 * clears, the header updates, and the previous customer's orders are still readable from
 * the reactive store by whoever signs in next on a shared machine.
 *
 * `queryKeys.auth` is set to an explicit `null` rather than removed, so `useCurrentUser`
 * resolves to "signed out" immediately instead of falling back to `isLoading` and putting
 * the router into its waiting-room redirect for a frame.
 */
export function clearAuthState(queryClient: QueryClient): void {
  // Evict ALL private user-scoped cache entries; public data stays cached.
  for (const key of privateQueryKeys) {
    queryClient.removeQueries({ queryKey: key });
  }
  // The TanStack DB collections are the *other* private store. Evicting the query cache
  // alone would leave the previous customer's orders, lines and rentals readable in the
  // reactive store for whoever signs in next, so the two are wiped together.
  clearPrivateCollections();
  queryClient.setQueryData(queryKeys.auth, null);
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginPayload) => login(payload),
    onSuccess: (user: User) => {
      // Seed the cache directly — no refetch needed after login.
      queryClient.setQueryData(queryKeys.auth, user);
      // Tell other tabs. They re-fetch `/auth/me`; no identity is broadcast.
      publishAuthChange("signed-in");
    },
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
    onSuccess: (user: User) => {
      queryClient.setQueryData(queryKeys.auth, user);
      publishAuthChange("signed-in");
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      publishAuthChange("signed-out");
    },
    /**
     * Deliberately `onSettled`, not `onSuccess`: the server deletes the session row and
     * clears the cookie before responding, so a network failure on the way back cannot
     * have left this device authenticated. Treating the logout as failed would leave the
     * header rendering a signed-in user whose session is genuinely gone — exactly the
     * stale-auth state another tab must not show, arrived at by a different route.
     */
    onSettled: () => {
      clearAuthState(queryClient);
    },
  });
}

/**
 * Save the signed-in user's own profile details.
 *
 * Writes the server's answer into `queryKeys.auth` rather than invalidating it: the
 * response *is* the updated user, so the header's name and avatar change on the same
 * render as the form, with no flash of the old value and no extra request. Invalidating
 * instead would also work, but only after a round trip, and every surface reading the
 * session user — header, profile page, footer — would briefly disagree with it.
 */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfileUpdatePayload) => updateProfile(payload),
    onSuccess: (user: User) => {
      queryClient.setQueryData(queryKeys.auth, user);
    },
  });
}

/**
 * Change the signed-in user's password.
 *
 * The current password is sent with the request and verified server-side; this client has
 * no way to check it, and must not pretend to. Neither the old nor the new password is
 * retained anywhere by this mutation — no cache entry, no form state left mounted.
 */
export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changePassword(payload),
  });
}

export type { ChangePasswordResponse };