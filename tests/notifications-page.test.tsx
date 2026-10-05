import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsPage } from "@/features/notifications";
import * as notificationQuery from "@/features/notifications/query";
import type {
  NotificationItem,
  NotificationPage,
  NotificationPreferences,
} from "@/features/notifications/types";

/**
 * `/notifications` — the feed's states, its controls, and the one promise the settings
 * block makes.
 *
 * The server is mocked rather than exercised, which is what makes this a *client* test:
 * the feed's behaviour is entirely a function of the four query hooks and the URL. What is
 * worth asserting here is the set of choices that are invisible in the hook layer —
 * whether a row without a destination pretends to be a link, whether a filtered-empty
 * state offers a way out, whether the bell's number and the page agree.
 */

const mocks = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  mutate: {
    setRead: vi.fn(),
    dismiss: vi.fn(),
    markAll: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/notifications/query", () => ({
  useNotifications: vi.fn(),
  useSetNotificationRead: vi.fn(),
  useDismissNotification: vi.fn(),
  useMarkAllNotificationsRead: vi.fn(),
  useNotificationPreferences: vi.fn(),
  useSaveNotificationPreferences: vi.fn(),
}));

function notification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    type: "ORDER_SHIPPED",
    title: "Order shipped",
    body: "Your order is on its way.",
    link: "/orders/RV-2026-8F3K2A",
    isRead: false,
    readAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    relatedEntityType: "ORDER",
    relatedEntityId: 1,
    category: "ORDERS",
    label: "Orders & purchases",
    icon: "ORDER",
    ...overrides,
  };
}

function preferences(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    orders: { inApp: true, email: true },
    rentals: { inApp: true, email: false },
    payments: { inApp: true, email: true },
    seller: { inApp: true, email: false },
    wishlist: { inApp: true },
    admin: { inApp: true },
    ...overrides,
  };
}

/** Configure the feed response, defaulting to the shapes most tests do not vary. */
function setFeed(page: Partial<NotificationPage> = {}) {
  vi.mocked(notificationQuery.useNotifications).mockReturnValue({
    data: {
      items: [],
      total: 0,
      totalUnread: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      ...page,
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = {};

  vi.mocked(notificationQuery.useSetNotificationRead).mockReturnValue({
    mutate: mocks.mutate.setRead,
    isPending: false,
    variables: undefined,
  } as never);
  vi.mocked(notificationQuery.useDismissNotification).mockReturnValue({
    mutate: mocks.mutate.dismiss,
    isPending: false,
    variables: undefined,
  } as never);
  vi.mocked(notificationQuery.useMarkAllNotificationsRead).mockReturnValue({
    mutate: mocks.mutate.markAll,
    isPending: false,
  } as never);
  vi.mocked(notificationQuery.useNotificationPreferences).mockReturnValue({
    data: preferences(),
    isLoading: false,
  } as never);
  vi.mocked(notificationQuery.useSaveNotificationPreferences).mockReturnValue({
    mutateAsync: mocks.mutate.save,
    isPending: false,
  } as never);

  setFeed();
});

describe("the feed's states", () => {
  it("says nothing has happened yet on an empty unfiltered feed", () => {
    render(<NotificationsPage />);

    expect(screen.getByText("No notifications yet")).toBeDefined();
    // The filtered-empty copy must not be used here: nothing is wrong, there is just no
    // history, and "clear the filter" would offer an action that changes nothing.
    expect(screen.queryByText("Clear filters")).toBeNull();
  });

  it("offers a way out of an empty filtered feed", async () => {
    mocks.search = { category: "PAYMENTS" };
    render(<NotificationsPage />);

    expect(screen.getByText("No payments & refunds notifications")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    // Clearing is a navigation to the unfiltered URL — the filter lives in the URL, so
    // "clear" means the URL stops carrying it.
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/notifications",
      search: {},
      replace: true,
    });
  });

  it("distinguishes a filtered-empty unread view from an empty feed", () => {
    mocks.search = { unread: "true" };
    render(<NotificationsPage />);

    // A different sentence, because the situation is different: the user has history, it
    // is just all read.
    expect(screen.getByText("Nothing unread")).toBeDefined();
  });

  it("shows skeletons while loading, not an empty state", () => {
    vi.mocked(notificationQuery.useNotifications).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never);

    render(<NotificationsPage />);

    expect(screen.getByText("Loading your notifications…")).toBeDefined();
    // The failure mode this guards: rendering "No notifications yet" for a request that
    // has not answered, which tells the user something false about their account.
    expect(screen.queryByText("No notifications yet")).toBeNull();
  });

  it("offers a retry when the feed fails", async () => {
    const refetch = vi.fn();
    vi.mocked(notificationQuery.useNotifications).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    } as never);

    render(<NotificationsPage />);

    expect(screen.getByText("Couldn't load your notifications")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("one notification row", () => {
  it("makes the title a link when the notification has a destination", () => {
    setFeed({ items: [notification()], total: 1 });
    render(<NotificationsPage />);

    const link = screen.getByRole("link", { name: "Order shipped" });
    expect(link.getAttribute("href")).toBe("/orders/RV-2026-8F3K2A");
  });

  it("renders a title with no destination as plain text, not a dead link", () => {
    setFeed({
      items: [notification({ id: 2, title: "Payment failed", link: null })],
      total: 1,
    });
    render(<NotificationsPage />);

    expect(screen.getByText("Payment failed")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Payment failed" })).toBeNull();
  });

  it("keeps the read control reachable beside the title link", async () => {
    // The bug this guards is a whole-row `<Link>`: it would swallow the click meant for
    // the read/dismiss buttons sitting on top of it, and the user could never mark
    // anything read without navigating away.
    setFeed({ items: [notification({ title: "Order shipped" })], total: 1 });
    render(<NotificationsPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /mark .*order shipped.* as read/i }),
    );

    expect(mocks.mutate.setRead).toHaveBeenCalledWith({
      id: 1,
      read: true,
      wasRead: false,
    });
  });

  it("dismisses a row through its own control", async () => {
    setFeed({ items: [notification()], total: 1 });
    render(<NotificationsPage />);

    await userEvent.click(screen.getByRole("button", { name: /dismiss .*order shipped/i }));

    expect(mocks.mutate.dismiss).toHaveBeenCalledWith({ id: 1, wasRead: false });
  });

  it("flips a read notification back to unread", async () => {
    // A user who taps a notification by accident needs a way back; a control that only
    // moves forward cannot offer one.
    setFeed({ items: [notification({ isRead: true })], total: 1 });
    render(<NotificationsPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /mark .*order shipped.* as unread/i }),
    );

    expect(mocks.mutate.setRead).toHaveBeenCalledWith({ id: 1, read: false, wasRead: true });
  });
});

describe("the unread count drives the page's controls", () => {
  it("offers Mark all as read only when something is unread", () => {
    setFeed({ items: [notification({ isRead: true })], total: 1, totalUnread: 0 });
    render(<NotificationsPage />);

    expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
  });

  it("marks everything read through the server, not by editing rows locally", async () => {
    setFeed({ items: [notification()], total: 1, totalUnread: 1 });
    render(<NotificationsPage />);

    await userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(mocks.mutate.markAll).toHaveBeenCalled();
  });

  it("shows the caught-up mark only when the feed is fully read", () => {
    setFeed({ items: [notification({ isRead: true })], total: 1, totalUnread: 0 });
    render(<NotificationsPage />);

    expect(screen.getByText("You're all caught up")).toBeDefined();
  });
});

describe("preferences offer only switches the server can honour", () => {
  it("renders an email switch for the four email-capable categories", () => {
    render(<NotificationsPage />);

    for (const label of [
      "Email for orders & purchases",
      "Email for rentals",
      "Email for payments & refunds",
      "Email for seller activity",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeDefined();
    }
  });

  it("renders no email switch for wishlist or admin", () => {
    /*
     * The user-facing half of the `PATCH /preferences` schema rule. Those two categories
     * have no email emitter, so a switch would be a control that looks saved and does
     * nothing — and a *disabled* switch is barely better, because it still advertises a
     * channel that does not exist. There is no switch.
     */
    render(<NotificationsPage />);

    expect(screen.getByRole("switch", { name: "In-app wishlist alerts" })).toBeDefined();
    expect(screen.getByRole("switch", { name: "In-app admin queue alerts" })).toBeDefined();
    expect(screen.queryByRole("switch", { name: /email for wishlist/i })).toBeNull();
    expect(screen.queryByRole("switch", { name: /email for admin/i })).toBeNull();
  });

  it("sends no email key for the in-app-only groups on save", async () => {
    // The other half. Sending `email` for wishlist/admin would be refused by the schema,
    // so the payload the form builds must omit it — which is what `handleSave` narrows.
    render(<NotificationsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "In-app wishlist alerts" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const payload = mocks.mutate.save.mock.calls[0]![0];
    expect(payload.wishlist).toEqual({ inApp: false });
    expect(payload.admin).toEqual({ inApp: true });
    // The four email-capable groups still round-trip their email flag.
    expect(payload.orders).toEqual({ inApp: true, email: true });
    expect(Object.keys(payload.wishlist)).toEqual(["inApp"]);
    expect(Object.keys(payload.admin)).toEqual(["inApp"]);
  });
});
