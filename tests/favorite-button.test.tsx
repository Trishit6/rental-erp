import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FavoriteButton } from "@/features/favorites/components/FavoriteButton";
import { addFavorite, getFavoriteIds, removeFavorite } from "@/features/favorites/api";
import { queryKeys } from "@/lib/query/keys";
import { ApiError } from "@/lib/api/client";

const authState = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));
const navigateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ href: "/browse?category=audio" }),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/features/favorites/api", () => ({
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  getFavoriteIds: vi.fn(),
  clearFavorites: vi.fn(),
  getFavorites: vi.fn(),
  checkFavorite: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderButton(props: Partial<ComponentProps<typeof FavoriteButton>> = {}) {
  return render(
    <FavoriteButton productId={1} title="Sony WH-1000XM5" slug="sony-wh-1000xm5" {...props} />,
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 1 };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(addFavorite).mockResolvedValue({ productId: 1, favorited: true });
  vi.mocked(removeFavorite).mockResolvedValue({ productId: 1, favorited: false });
  vi.mocked(getFavoriteIds).mockResolvedValue([]);
});

describe("FavoriteButton states", () => {
  it("is not favourited when the product is not saved", () => {
    client.setQueryData(queryKeys.favoriteIds, []);

    renderButton();

    const button = screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).not.toBeDisabled();
  });

  it("reads the saved state from the shared id list, not from local state", () => {
    client.setQueryData(queryKeys.favoriteIds, [1, 2, 3]);

    renderButton();

    const button = screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the flag the product payload carried while the id list is still loading", async () => {
    // The grid is correct on first paint because the product response said so,
    // and the heart does not flash empty before the shared list resolves.
    vi.mocked(getFavoriteIds).mockReturnValue(new Promise(() => {}));

    renderButton({ hint: true });

    expect(
      await screen.findByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the id list take over once it answers", async () => {
    // The shared list is the authority: it wins over a stale hint.
    vi.mocked(getFavoriteIds).mockResolvedValue([]);

    renderButton({ hint: true });

    expect(
      await screen.findByRole("button", { name: "Add Sony WH-1000XM5 to favorites" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a pending state while the request is in flight", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.favoriteIds, []);

    let settle!: (value: { productId: number; favorited: boolean }) => void;
    vi.mocked(addFavorite).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    renderButton();
    await user.click(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" }));

    // The heart is already filled optimistically, and busy while it settles.
    const pending = await screen.findByRole("button", {
      name: "Remove Sony WH-1000XM5 from favorites",
    });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute("aria-busy", "true");

    settle({ productId: 1, favorited: true });
  });

  it("waits rather than guessing while the saved set is still unknown", () => {
    // No seeded ids and no hint: the control is honest about not knowing yet.
    renderButton();

    expect(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" })).toBeDisabled();
  });

  it("renders the labelled variant for the product page's mobile bar", () => {
    client.setQueryData(queryKeys.favoriteIds, [1]);

    renderButton({ variant: "labelled" });

    const button = screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" });
    expect(button).toHaveTextContent("Saved");
  });
});

describe("FavoriteButton mutations", () => {
  it("saves on click and reflects it immediately", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.favoriteIds, []);

    renderButton();
    await user.click(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" }));

    await waitFor(() => expect(addFavorite).toHaveBeenCalledWith(1));
    expect(
      await screen.findByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("unsaves an already-saved product", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.favoriteIds, [1]);

    renderButton();
    await user.click(screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" }));

    await waitFor(() => expect(removeFavorite).toHaveBeenCalledWith(1));
    expect(addFavorite).not.toHaveBeenCalled();
  });

  /* Two clicks must never produce two requests: the second arrives while the
     first is still open and would otherwise race the saved state. */
  it("ignores a second click while the first is in flight", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.favoriteIds, []);

    let settle!: (value: { productId: number; favorited: boolean }) => void;
    vi.mocked(addFavorite).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    renderButton();
    const button = screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" });
    await user.click(button);
    await user.click(button);

    expect(addFavorite).toHaveBeenCalledTimes(1);
    settle({ productId: 1, favorited: true });
  });

  it("restores the previous state and explains when the request fails", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.favoriteIds, [1]);
    vi.mocked(removeFavorite).mockRejectedValue(new ApiError("INTERNAL_ERROR", "boom", 500));

    renderButton();
    await user.click(screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" }))
      .toHaveAttribute("aria-pressed", "true");
  });
});

describe("FavoriteButton for guests", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("still renders, so a visitor can see the control", () => {
    client.setQueryData(queryKeys.favoriteIds, [1]);

    renderButton();

    expect(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" })).toBeVisible();
  });

  it("prompts to sign in instead of firing a doomed request", async () => {
    const user = userEvent.setup();

    renderButton();
    await user.click(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" }));

    expect(addFavorite).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Sign in to save items", expect.anything());
  });

  it("keeps the product as the destination after signing in", async () => {
    const user = userEvent.setup();
    vi.mocked(toastMock).mockReturnValue({
      id: "toast",
      action: { label: "Sign in" },
    } as never);

    renderButton();
    await user.click(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" }));

    // The toast's own action is what navigates, so drive it directly.
    const options = vi.mocked(toastMock).mock.calls[0]![1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/login",
      search: { redirect: "/browse?category=audio" },
    });
  });

  it("never shows a previous user's saved state", () => {
    client.setQueryData(queryKeys.favoriteIds, [1, 2, 3]);

    renderButton();

    expect(screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
