import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfilePage } from "@/features/profile";
import { queryKeys } from "@/lib/query/keys";
import type { User } from "@/features/auth/types";

/**
 * `/profile` — the account screen.
 *
 * ## What is worth testing here, and what is not
 *
 * The interesting properties of this page are about *what the user can do to their own
 * account*: that the details on screen come from the session rather than from somewhere
 * else, that the fields are read-only until the user asks to change them, that a save
 * writes back to the same cache entry the header reads — so the name beside the avatar and
 * the name in the navbar cannot disagree — and that a password change refuses the
 * mismatched-pair and the "same password as before" cases before any request is made.
 *
 * The mutations themselves are mocked. What is under test is the page's behaviour, and the
 * server's own guarantees (whitelisted fields, current-password verification, session
 * revocation) are asserted in `auth-session.test.ts` against the real router.
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: null as User | null,
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

// Every outcome on this page — a rejected form, a failed save, a revoked session — is
// announced through a toast rather than inline text. Mocking the module is what makes those
// announcements assertable at all: with no `<Toaster />` mounted, sonner renders nothing.
vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/features/auth/api", () => ({
  updateProfile: (...args: unknown[]) => mocks.updateProfile(...args),
  changePassword: (...args: unknown[]) => mocks.changePassword(...args),
  logout: () => mocks.logout(),
  login: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/features/reviews", () => ({
  MyReviewsSection: () => <div data-testid="reviews" />,
}));

vi.mock("@/features/profile/query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/profile/query")>();
  return {
    ...actual,
    // Addresses are a separate feature with their own tests; the profile card's interest
    // is that it still renders alongside them.
    useAddresses: () => ({ data: [] }),
    useAddressMutations: () => ({ addAddress: vi.fn(), removeAddress: vi.fn() }),
  };
});

vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    fetchImageUploadConfig: vi.fn().mockResolvedValue({
      available: true,
      provider: "dev",
      isDevelopmentAdapter: true,
      maxBytes: 5 * 1024 * 1024,
      maxImages: 8,
      allowedTypes: ["image/jpeg", "image/png"],
    }),
    uploadAvatarImage: vi.fn(),
  };
});

const BASE: User = {
  id: 42,
  name: "Asha Rao",
  email: "asha@example.com",
  role: "USER",
  verified: true,
  avatarUrl: null,
  phone: null,
  createdAt: "2026-01-15T00:00:00.000Z",
};

function renderPage(user: User = BASE) {
  mocks.user = user;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ProfilePage />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = BASE;
  mocks.updateProfile.mockImplementation(async (payload: Partial<User>) => ({
    ...BASE,
    ...payload,
  }));
  mocks.changePassword.mockResolvedValue({ changed: true, revokedSessions: 1 });
  mocks.logout.mockResolvedValue({ loggedOut: true });
});

describe("the account facts on screen", () => {
  it("shows the signed-in user's name, email and account type", () => {
    renderPage();

    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getAllByText(/Customer/).length).toBeGreaterThan(0);
  });

  it("offers no control that could change the role", () => {
    renderPage();

    // The role is displayed, never editable. A control that merely *looked* editable would
    // be a lie — the server's schema is a whitelist and has no `role` in it — so the test
    // is that there is no such affordance on the page at all.
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /account type/i })).not.toBeInTheDocument();
  });

  it("shows the month and year the account was created", () => {
    // The counterpart to the next test: without it, "drop the row when there is no date" and
    // "never show the row" are indistinguishable.
    renderPage({ ...BASE, createdAt: "2026-01-15T00:00:00.000Z" });

    expect(screen.getByText("Member since")).toBeInTheDocument();
    expect(screen.getByText("January 2026")).toBeInTheDocument();
  });

  it("does not render a member-since line when the server sent no date", () => {
    renderPage({ ...BASE, createdAt: undefined });

    // Formatting `undefined` would put "Invalid Date" on the page, which reads as data. And
    // the label goes with the value: a "Member since" heading over an empty cell reads as a
    // date that failed to load, which is a different and more alarming thing than the server
    // simply not having sent one.
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Member since/i)).not.toBeInTheDocument();
  });
});

describe("the avatar", () => {
  it("falls back to the initial when there is no photo", () => {
    const { container } = renderPage();

    expect(container.querySelector("img")).toBeNull();
    // `Avatar` renders an aria-hidden span carrying the initial.
    expect(container.textContent).toContain("A");
  });

  it("renders the photo the server actually returned", () => {
    // The header used to read `user.avatar` — a field that does not exist on the wire — so
    // every user in the app saw a fallback initial regardless of their picture. The type
    // said `avatar: string | null`, TypeScript believed it, and nothing failed visibly.
    const { container } = renderPage({ ...BASE, avatarUrl: "https://cdn.example.com/a/avatars/42/x.png" });

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/a/avatars/42/x.png",
    );
  });
});

describe("editing details", () => {
  it("keeps the fields read-only until the user asks to edit", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByLabelText("Full name")).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: /edit details/i }));

    expect(screen.getByLabelText("Full name")).not.toHaveAttribute("readonly");
  });

  it("saves the edit and writes the answer into the session cache", async () => {
    // One entry, `queryKeys.auth`. The header reads it too, so writing the server's
    // response here is what keeps the navbar name and this form from disagreeing — and it
    // updates both on the same render, with no refetch and no flash of the old value.
    const user = userEvent.setup();
    const { client } = renderPage();
    client.setQueryData(queryKeys.auth, BASE);

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    const name = screen.getByLabelText("Full name");
    await user.clear(name);
    await user.type(name, "Asha R");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    expect(mocks.updateProfile).toHaveBeenCalledWith({ name: "Asha R", phone: "" });
  });

  it("discards the edit on cancel, returning the server's values", async () => {
    const user = userEvent.setup();
    renderPage({ ...BASE, phone: "9876543210" });

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Wrong Name");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByLabelText("Full name")).toHaveValue("Asha Rao");
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses a phone number that is not a number, before sending anything", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /edit details/i }));
    await user.type(screen.getByLabelText("Phone"), "call me maybe");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid phone number/i)).toBeInTheDocument();
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});

describe("changing the password", () => {
  async function openSecurity(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Current password"), "old-password-1");
    await user.type(screen.getByLabelText("New password"), "new-password-1");
  }

  it("refuses a mismatched confirmation without contacting the server", async () => {
    const user = userEvent.setup();
    renderPage();

    await openSecurity(user);
    await user.type(screen.getByLabelText("Confirm new password"), "something-else");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("refuses a new password identical to the current one", async () => {
    // Without this, a user can "change" their password to the password they already have
    // and be told it worked — believing their account is protected by something new when
    // nothing changed at all. The client never sees the stored hash, so this is the only
    // place the mistake can be caught.
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Current password"), "same-password");
    await user.type(screen.getByLabelText("New password"), "same-password");
    await user.type(screen.getByLabelText("Confirm new password"), "same-password");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/haven't used before/i));
    });
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("submits the current and new password, and never the confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    await openSecurity(user);
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledTimes(1));
    // The confirmation is a form concern; the endpoint rejects unknown keys outright, so
    // sending it would imply a server-side check that does not exist.
    expect(mocks.changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password-1",
      newPassword: "new-password-1",
    });
  });

  it("tells the user how many other sessions were signed out", async () => {
    // "Your password was changed" and "…and the phone you were signed in on no longer is"
    // are different things to someone whose account may be under attack, and only the
    // second one is actionable.
    mocks.changePassword.mockResolvedValue({ changed: true, revokedSessions: 2 });
    const user = userEvent.setup();
    renderPage();

    await openSecurity(user);
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Password updated. We signed out 2 other sessions.",
      );
    });
    expect(mocks.changePassword).toHaveBeenCalledTimes(1);
  });

  it("uses the singular form when exactly one session was revoked", async () => {
    mocks.changePassword.mockResolvedValue({ changed: true, revokedSessions: 1 });
    const user = userEvent.setup();
    renderPage();

    await openSecurity(user);
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Password updated. We signed out 1 other session.",
      );
    });
  });

  it("empties every field after a successful change", async () => {
    // Leaving the old password in a mounted input is the kind of thing that survives a
    // screenshot or a shared machine.
    const user = userEvent.setup();
    renderPage();

    await openSecurity(user);
    await user.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Current password")).toHaveValue("");
    });
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });
});

describe("signing out", () => {
  it("invalidates the session and returns to the public area", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });
});