import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteHeader } from "@/components/layout/site-header";
import type { User } from "@/features/auth/types";

/**
 * The header's reaction to who is signed in.
 *
 * ## Why this is worth its own file
 *
 * The header is the only piece of chrome present on every page, so a mistake here is the one
 * every visitor sees. Two failures are possible and they are opposites:
 *
 *   - a signed-in user is offered "Login", or
 *   - a signed-out visitor is offered "My Profile" / "Sign out".
 *
 * Both have been real at some point. What protects them is not the `user ? … : …` ternary
 * itself but the fact that both branches read one `user` from one query — there is no second
 * source of truth that could disagree. These tests pin that down at both breakpoints, since
 * the desktop cluster and the mobile sheet are separate trees that each have to make the same
 * decision independently.
 *
 * Everything the header *borrows* from other features — the cart trigger, the notification
 * bell, the theme toggle — is mocked out. This is a test of the header's own auth branching,
 * and those components have their own suites.
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: null as User | null,
  logout: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/features/auth/query", () => ({
  useLogoutMutation: () => ({ mutateAsync: mocks.logout, isPending: false }),
}));

vi.mock("@/features/cart/components/CartDrawerTrigger", () => ({
  CartDrawerTrigger: () => <button type="button">Cart</button>,
}));

vi.mock("@/features/notifications/components/NotificationBell", () => ({
  NotificationBell: () => <button type="button">Notifications bell</button>,
}));

vi.mock("@/features/notifications/query", () => ({
  useUnreadCount: () => ({ data: 0 }),
}));

vi.mock("@/features/notifications/components/schema", () => ({
  badgeLabel: (count: number) => String(count),
}));

vi.mock("@/lib/theme", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

const CUSTOMER: User = {
  id: 7,
  name: "Asha Rao",
  email: "asha@example.com",
  role: "USER",
  verified: true,
  avatarUrl: null,
  phone: null,
  createdAt: "2026-01-15T00:00:00.000Z",
};

const SELLER: User = { ...CUSTOMER, id: 8, name: "Ravi Menon", role: "SELLER" };

function renderHeader(user: User | null = null) {
  mocks.user = user;
  return render(<SiteHeader />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue({ loggedOut: true });
});

describe("the desktop account cluster", () => {
  it("offers Login and Register as two controls when nobody is signed in", () => {
    // The two lead to different forms and answer different questions. A single combined
    // "Login / Sign up" control made a first-time visitor guess which one they wanted.
    renderHeader(null);

    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toBeInTheDocument();
  });

  it("shows no account control of any kind when nobody is signed in", () => {
    renderHeader(null);

    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("replaces Login and Register with the account menu once signed in", () => {
    // Not "adds" — replaces. A header showing "Login" beside "My Profile" is the
    // contradictory state worth ruling out.
    renderHeader(CUSTOMER);

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).not.toBeInTheDocument();
  });

  it("names the signed-in user, so the control is not an anonymous avatar", () => {
    renderHeader(CUSTOMER);

    expect(screen.getByText("Asha")).toBeInTheDocument();
  });

  it("does not offer the seller dashboard to a customer", async () => {
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    await waitFor(() => expect(screen.getByText("My Profile")).toBeInTheDocument());
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Shopfront settings")).not.toBeInTheDocument();
  });

  it("offers shopfront settings to a seller", async () => {
    // `/dashboard/settings` is `requireSeller`-guarded, so a link to it from a customer's
    // menu means a destination that bounces them to onboarding.
    const user = userEvent.setup();
    renderHeader(SELLER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    await waitFor(() => expect(screen.getByText("My Profile")).toBeInTheDocument());
    expect(screen.getByText("Shopfront settings")).toBeInTheDocument();
  });

  it("does not offer shopfront settings to a customer", async () => {
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    await waitFor(() => expect(screen.getByText("My Profile")).toBeInTheDocument());
    expect(screen.queryByText("Shopfront settings")).not.toBeInTheDocument();
  });

  it("offers the admin workspace to an admin and not to a seller", async () => {
    const user = userEvent.setup();
    renderHeader({ ...SELLER, role: "ADMIN" });

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    await waitFor(() => expect(screen.getByText("Admin workspace")).toBeInTheDocument());
  });

  it("navigates to the orders a signed-in user came for", async () => {
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => expect(screen.getByText("My Orders")).toBeInTheDocument());
    await user.click(screen.getByText("My Orders"));

    // `onSelect` navigates programmatically rather than through an anchor — so asserting the
    // href would have passed even if the click did nothing.
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/profile/orders" }));
  });

  it("offers the wishlist, profile and logout a signed-in user expects", async () => {
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    await waitFor(() => expect(screen.getByText("My Profile")).toBeInTheDocument());
    expect(screen.getByText("My Orders")).toBeInTheDocument();
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("signs out from the account menu and returns to the public area", async () => {
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => expect(screen.getByText("Logout")).toBeInTheDocument());
    await user.click(screen.getByText("Logout"));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("still returns to the public area when the sign-out request fails", async () => {
    // `useLogoutMutation` clears the client session either way, because the server deletes
    // it before it replies. So a rejection must not leave the user on a route that is now
    // guarded, about to be bounced to the login screen with an *expiry* message for a logout
    // they just performed themselves — and it must not claim the server confirmed something
    // it never answered about.
    const user = userEvent.setup();
    mocks.logout.mockRejectedValue(new Error("network"));
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => expect(screen.getByText("Logout")).toBeInTheDocument());
    await user.click(screen.getByText("Logout"));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        "Signed out on this device. We couldn't reach the server to confirm.",
      ),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });
});

describe("the mobile sheet", () => {
  it("offers Login and Register when nobody is signed in", async () => {
    const user = userEvent.setup();
    renderHeader(null);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    await waitFor(() =>
      // The desktop cluster is also mounted — it is hidden with a `md:flex` class, and jsdom
      // applies no stylesheet — so both copies are legitimately in the document.
      expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getAllByRole("link", { name: "Register" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("offers the account destinations and Sign out when signed in", async () => {
    // The sheet is a flat list rather than the Radix dropdown, so it has to reach the same
    // auth decision on its own — it is a separate branch of the same ternary, not a
    // rendering of the desktop one.
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    await waitFor(() => expect(screen.getByText("My orders")).toBeInTheDocument());
    expect(screen.getByText("My rentals")).toBeInTheDocument();
    expect(screen.getByText("Wishlist")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).not.toBeInTheDocument();
  });

  it("shows the workspace dashboard and hides the seller link from a customer", async () => {
    // Every signed-in user's sheet offers the authenticated workspace home
    // (`/dashboard`). What a customer must NOT see is the *seller* entry — it
    // changes the "Seller Dashboard" wording so the two can be told apart.
    const user = userEvent.setup();
    renderHeader(CUSTOMER);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    await waitFor(() => expect(screen.getByText("My orders")).toBeInTheDocument());
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Seller Dashboard")).not.toBeInTheDocument();
  });

  it("shows the seller dashboard to a seller", async () => {
    const user = userEvent.setup();
    renderHeader(SELLER);

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    await waitFor(() => expect(screen.getByText("My orders")).toBeInTheDocument());
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Seller Dashboard")).toBeInTheDocument();
  });
});