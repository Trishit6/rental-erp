import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { GoToTop } from "@/components/shared/GoToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Chatbot } from "@/features/chatbot";
import { CartDrawerHost, CartDrawerProvider } from "@/features/cart";
import type { AuthUser } from "@/lib/auth/auth-context";
import { FloatingRail, FloatingRailProvider } from "@/lib/floating/rail";
import type { QueryClient } from "@tanstack/react-query";

type RouterContext = { user: AuthUser | null; queryClient: QueryClient };

export function RootLayout() {
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
            <SiteHeader />
            <main>
              <Outlet />
            </main>
            <SiteFooter />
            {/* One fixed column owns the bottom-right corner. Controls render
                into it from wherever they are declared. */}
            <FloatingRail />
            <GoToTop />
            <Chatbot />
            <CartDrawerHost />
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
