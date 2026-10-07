import { createRootRouteWithContext, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { GoToTop } from "@/components/shared/GoToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartDrawerHost, CartDrawerProvider } from "@/features/cart";
import type { AuthUser } from "@/lib/auth/auth-context";
import { FloatingRail, FloatingRailProvider } from "@/lib/floating/rail";
import type { QueryClient } from "@tanstack/react-query";

type RouterContext = { user: AuthUser | null; queryClient: QueryClient };

export function RootLayout() {
  // The admin workspace renders its own shell (sidebar, section header) and must be
  // "completely separate from the normal customer-facing navigation".
  //
  // So `/admin` and everything under it gets *no* site header, footer, floating rail,
  // go-to-top. A cart button has no business in a moderation queue, and a
  // storefront header would offer a way out of a surface that should be deliberate to
  // leave. The providers above stay regardless: they own app-wide state, and the
  // admin pages use neither but removing them would mean two provider trees for no
  // benefit.
  //
  // This is presentation only. Authorization is enforced by `beforeLoad:
  // requireAdmin` on the admin routes and by `requireAdmin` on every `/api/admin/*`
  // endpoint — hiding chrome is not access control.
  const isAdmin = useRouterState({
    select: (state) => {
      const path = state.location.pathname;
      return path === "/admin" || path.startsWith("/admin/");
    },
  });

  // The authenticated workspace (orders, rentals, profile, dashboard, …) renders
  // its own chrome — sidebar, topbar, mobile menu — so the storefront header and
  // footer are hidden there too. Detected by matched route ids rather than by
  // pathname, because the layout is pathless: `/orders` and `/profile` look like
  // any other page from the URL alone, but their route id in the tree is
  // `/_authenticated/orders`.
  //
  // `state.matches` is always present in the real router; the `??` guard only
  // keeps this selector total for callers that hand it a partial state.
  const isWorkspace = useRouterState({
    select: (state) =>
      state.matches?.some((match) => match.routeId.startsWith("/_authenticated")) ?? false,
  });

  return (
    // Two providers wrap the whole app, in this order:
    //  - the cart drawer's open state is shared by the navbar, the floating dock
    //    and the moment after any add-to-cart;
    //  - the floating rail must sit *above* the routes as well as above the
    //    controls, because a control can claim a slot from inside any route.
    // Both are above the tree on purpose; neither belongs to one page.
    <CartDrawerProvider>
      <FloatingRailProvider>
        <TooltipProvider>
          <div className="min-h-screen">
            {isAdmin || isWorkspace ? (
              <Outlet />
            ) : (
              <>
                <SiteHeader />
                <main>
                  <Outlet />
                </main>
                <SiteFooter />
                {/* One fixed column owns the bottom-right corner. Controls render
                    into it from wherever they are declared. */}
                <FloatingRail />
                <GoToTop />
                <CartDrawerHost />
              </>
            )}
          </div>
        </TooltipProvider>
      </FloatingRailProvider>
    </CartDrawerProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="page-wrap flex flex-col items-center py-24 text-center">
      <p className="eyebrow">Lost and found</p>
      <h1 className="section-title mt-2 text-4xl">This page moved out.</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The page you're looking for doesn't exist — but the neighbourhood does.
      </p>
      <Link to="/" className="mt-6 font-bold text-primary hover:underline">
        Back home
      </Link>
    </div>
  );
}

function ErrorPage() {
  return (
    <div className="page-wrap flex flex-col items-center py-24 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="section-title mt-2 text-4xl">An unexpected error occurred.</h1>
      <Link to="/" className="mt-6 font-bold text-primary hover:underline">
        Back home
      </Link>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});
