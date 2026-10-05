import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
  isSessionExpiredError,
  isSessionQuery,
  reportSessionExpired,
} from "../auth/session-expiry";

/**
 * Global QueryClient factory — one instance per app, created in main.tsx.
 *
 * ## Why the QueryCache is constructed here
 *
 * A session can expire at any moment, and when it does nothing tells the app directly: the
 * next request simply answers `401`. Catching that centrally is the only way to reach every
 * surface at once — the header's account menu, the notification badge, whichever private
 * query the current page happened to have mounted.
 *
 * TanStack Query v5 dropped `onError` from query options and exposes it on `QueryCache`,
 * where it is read from the *constructor config* rather than off the instance. So this is a
 * `QueryClient` with an explicit `QueryCache`, and the handler delegates to
 * `lib/auth/session-expiry` rather than reaching for the auth context — that module sits
 * below React, so `AuthProvider` can decide what an expiry actually means (clear the
 * caches, tell the user) without this file knowing anything about components.
 *
 * `lib/auth/session-expiry` filters out the auth query's own 401 and reports the rest; the
 * decision about whether anyone was signed in is made by the provider, which is the only
 * place that knows the current user.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // The session query answers 401 for every signed-out visitor, so treating its own
        // failure as an expiry would greet every anonymous visitor with "your session has
        // expired".
        if (isSessionQuery(query.queryKey)) return;
        if (!isSessionExpiredError(error)) return;
        reportSessionExpired();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 min default; refined per-query
        gcTime: 10 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}