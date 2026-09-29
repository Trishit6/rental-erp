import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Chatbot } from "@/features/chatbot";
import { CartDrawerHost, CartDrawerProvider } from "@/features/cart";
import type { AuthUser } from "@/lib/auth/auth-context";
import type { QueryClient } from "@tanstack/react-query";

type RouterContext = { user: AuthUser | null; queryClient: QueryClient };

export function RootLayout() {
  return (
    // The cart drawer's open state is shared by the navbar, the floating dock and
    // the moment after any add-to-cart, so it is owned once, here, above the routes.
    <CartDrawerProvider>
      <div className="min-h-screen">
        <SiteHeader />
        <main>
          <Outlet />
        </main>
        <SiteFooter />
        <Chatbot />
        <CartDrawerHost />
      </div>
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
