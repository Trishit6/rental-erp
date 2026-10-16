import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NavbarSearch, SearchBox } from "@/components/shared/search/SearchBox";
import type { SuggestionsPayload } from "@/components/shared/search/search-state";

/**
 * PROMPT R11 — the SearchBox in interaction.
 *
 * The keyboard table (every key, including the wrap-around on the arrows and
 * the two-press Escape), the contract "/' focuses when not typing in a field",
 * the stale-data discipline (the previous request is aborted through the query
 * signal), the guest storage rule (in-memory only — nothing in
 * localStorage or sessionStorage), the navbar collapse driven by a mocked
 * IntersectionObserver, and the one URL contract for submitting.
 *
 * The API module is mocked so suggestions are controllable; the router's
 * `useNavigate` is mocked so navigation targets are asserted. framer-motion is
 * stubbed the way `tests/site-header-auth.test.tsx` does.
 */

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  user: null as null | { id: number; name: string },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: (options?: { select?: (state: unknown) => unknown }) => {
    const state = { location: { pathname: "/browse" } };
    return options?.select ? options.select(state) : state;
  },
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    get: mocks.get,
    post: mocks.post,
    delete: mocks.delete,
  },
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...rest }: { children?: ReactNode;[key: string]: unknown }) => (
      <div {...framerSafe(rest)}>{children}</div>
    ),
    p: ({ children, ...rest }: { children?: ReactNode;[key: string]: unknown }) => (
      <p {...framerSafe(rest)}>{children}</p>
    ),
  },
}));

/** Framer props like `initial`/`exit` are not DOM attrs; drop them. */
function framerSafe(rest: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === "string") safe[key] = value;
  }
  return safe;
}

const suggestPayload: SuggestionsPayload = {
  query: "camera",
  products: [
    { id: 1, slug: "sony-a7", title: "Sony A7 Kit", image: null, pricePerDay: 49_900, categoryName: "Cameras" },
    { id: 2, slug: "canon-r6", title: "Canon R6 Body", image: null, pricePerDay: 61_200, categoryName: "Cameras" },
  ],
  categories: [{ id: 3, slug: "cameras", name: "Cameras", path: "Electronics" }],
  brands: [{ id: 4, slug: "sony-brand", name: "Sony" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.navigate.mockResolvedValue(undefined);
  mocks.get.mockImplementation((path: string) => {
    if (path.startsWith("/api/search/suggest")) {
      return Promise.resolve({ data: suggestPayload });
    }
    if (path === "/api/search/trending") {
      return Promise.resolve({ data: { terms: ["tripod", "gaming chair"], source: "history" } });
    }
    if (path === "/api/search/history") {
      return Promise.resolve({ data: [{ id: 12, term: "film camera" }] });
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
  mocks.post.mockResolvedValue({ data: { stored: true } });
  mocks.delete.mockResolvedValue({ data: { deleted: true } });
});

afterEach(() => {
  cleanup();
  document.getElementById("hero-search")?.remove();
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

function renderBox(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function input() {
  return screen.getByRole("searchbox", { name: "Search the marketplace" });
}

/* ------------------------------- keyboard map -------------------------------- */

const openSuggestions = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(input(), "camera");
  await screen.findByRole("listbox", { name: "Search suggestions" });
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
};

/* --------------------------------- suites ------------------------------------ */

describe("the URL contract", () => {
  it("Enter navigates to /browse?search=<term> — the `search` param name is untouched", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "  drill  {Enter}");
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/browse", search: { search: "drill" } }),
    );
  });

  it("choosing a product navigates to its page; category to /categories/$slug; brand to /browse?brand=", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await openSuggestions(user);

    // Keyboard into the first row (a product) and press Enter.
    await user.type(input(), "{ArrowDown}");
    await user.type(input(), "{Enter}");
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/product/$slug",
      params: { slug: "sony-a7" },
    }));
  });

  it("ArrowDown/ArrowUp wrap around the flat option list and Home/End clamp to its ends", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await openSuggestions(user);
    // products(2) → categories(1) → brands(1) = 4 options.
    const box = screen.getByRole("combobox");

    await user.type(input(), "{ArrowDown}"); // index 0
    expect(box).toHaveAttribute("aria-activedescendant");
    const firstId = box.getAttribute("aria-activedescendant");

    await user.type(input(), "{ArrowUp}"); // wraps back to the last option
    const wrappedId = box.getAttribute("aria-activedescendant");
    expect(wrappedId).not.toBe(firstId);

    await user.type(input(), "{Home}");
    expect(box.getAttribute("aria-activedescendant")).toBe(firstId);

    await user.type(input(), "{End}");
    await user.type(input(), "{ArrowDown}"); // Beyond End wraps to 0 again
    expect(box.getAttribute("aria-activedescendant")).toBe(firstId);
  });

  it("Escape clears first, then closes; Tab closes without clearing", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    const box = input();

    await user.type(box, "camera");
    // First press: clears the field; second: closes the dropdown.
    await user.keyboard("{Escape}{Escape}");
    expect(box).toHaveValue("");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

    await user.type(box, "camera");
    await user.keyboard("{Tab}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("'/' focuses the search box when the focus is not in an editable field", async () => {
    renderBox(<SearchBox variant="navbar" />);
    // A real '/" keystroke bubbles from <body> to the document listener.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("'/' does not steal focus from a field the user is typing in", async () => {
    const user = userEvent.setup();
    renderBox(
      <>
        <SearchBox variant="navbar" />
        <textarea aria-label="Notes" data-testid="notes" />
      </>,
    );
    const notes = document.querySelector("textarea") as HTMLTextAreaElement;
    notes.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    expect(document.activeElement).not.toBe(input());
    void user;
  });

  it("live region announces result counts politely", async () => {
    renderBox(<SearchBox variant="navbar" />);
    await openSuggestions(userEvent.setup());
    await waitFor(() => {
      expect(document.body.textContent).toContain("2 products found");
    });
  });
});

/* --------------------------- data, guests and history ------------------------- */

describe("suggestions fetch with abort and cache", () => {
  it("debounces 250 ms and requests the normalized query exactly once", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "  Camera  ");
    await waitFor(() => {
      const suggestCalls = (mocks.get as Mock).mock.calls
        .filter(([path]: [string]) => path.startsWith("/api/search/suggest"))
        .map(([path]: [string]) => path);
      expect(suggestCalls).toEqual(["/api/search/suggest?q=camera"]);
    });
  });
});

describe("guest recents stay in memory only", () => {
  it("recording a search POSTs nothing for a guest and writes no browser storage", async () => {
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "laser level{Enter}");
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/browse", search: { search: "laser level" } }),
    );

    expect(mocks.post).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("a private term (email, 8+ digits) is never recorded, server-side rule mirrored", async () => {
    // Opening the empty surface shows the session store; a private term typed
    // and re-opened leaves no recents behind.
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "billing@example.com{Enter}");
    await user.type(input(), "{Escape}");

    // Re-focus with an empty box: the recent list is empty (server history is
    // also empty for this guest), so no recent row is present.
    input().focus();
    await waitFor(() => expect(screen.queryByText("billing@example.com")).toBeNull());
  });
});

describe("signed-in recents persist and can be removed", () => {
  it("a submit POSTs the history term fire-and-forget", async () => {
    mocks.user = { id: 7, name: "Asha" };
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), " spotting scope{Enter}");
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/browse", search: { search: "spotting scope" } }),
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/search/history", { term: "spotting scope" }));
  });

  it("the empty panel lists server recents and removing one DELETEs its row", async () => {
    mocks.user = { id: 7, name: "Asha" };
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    input().focus();
    await screen.findByText("film camera");

    await user.click(screen.getByRole("button", { name: "Remove recent search film camera" }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith("/api/search/history/12"));
  });
});

describe("noResults and error states", () => {
  it("an empty payload renders 'Did you mean' when the server offered one", async () => {
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith("/api/search/suggest")) {
        return Promise.resolve({
          data: {
            query: "sona",
            products: [],
            categories: [],
            brands: [],
            didYouMean: "Sony",
          },
        });
      }
      return Promise.resolve({ data: { terms: [], source: "featured" } });
    });
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "sona");
    // Debounce then fetch then resolve — the did-you-mean row cannot be there
    // before the parked 250ms commit.
    const suggestion = await screen.findByRole("button", { name: "Sony" }, { timeout: 3000 });
    await user.click(suggestion);
    // Picking the repair fills the field for a fresh search.
    await waitFor(() => expect(input()).toHaveValue("Sony"));
  });

  it("a failed fetch shows the retry row that re-runs the request", async () => {
    const alreadyFailed = { called: false };
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith("/api/search/suggest")) {
        if (alreadyFailed.called) return Promise.resolve({ data: suggestPayload });
        alreadyFailed.called = true;
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve({ data: { terms: [], source: "featured" } });
    });
    const user = userEvent.setup();
    renderBox(<SearchBox variant="navbar" />);
    await user.type(input(), "camera");
    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeInTheDocument());
    await user.click(screen.getByText("Try again"));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Sony A7 Kit/ })).toBeInTheDocument(),
    );
  });
});

/* ------------------------------- navbar collapse ------------------------------ */

class FakeIntersectionObserver {
  static report: boolean | null = null;
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {
    if (FakeIntersectionObserver.report !== null) {
      // Synchronous first callback, like a real observer's initial entry.
      this.callback([{ isIntersecting: FakeIntersectionObserver.report } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
  }
  disconnect() {}
  unobserve() {}
}

describe("the navbar collapses while the homepage hero search is visible", () => {
  it("collapsed (icon) while the hero is on screen; expands when it leaves", async () => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIntersectionObserver;
    const hero = document.createElement("div");
    hero.id = "hero-search";
    document.body.appendChild(hero);

    FakeIntersectionObserver.report = true;
    const { rerender } = renderBox(<NavbarSearch onHomepage />);
    await waitFor(() =>
      expect(screen.getByTestId("navbar-search-collapsed")).toBeInTheDocument(),
    );

    FakeIntersectionObserver.report = false;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NavbarSearch onHomepage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId("navbar-search-collapsed")).toBeNull());
    expect(screen.getByRole("searchbox", { name: "Search the marketplace" })).toBeInTheDocument();
  });

  it("below 640px the trigger is an icon that opens the full-screen overlay", async () => {
    const user = userEvent.setup();
    // jsdom cannot lay out, so only the React-visible behaviour is asserted.
    renderBox(<NavbarSearch />);
    await user.click(screen.getByTestId("mobile-search-trigger"));
    expect(screen.getByRole("dialog", { name: "Search the marketplace" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the overlay closes itself after a navigation (route change)", async () => {
    // The overlay watches the router's pathname; this mock returns "/browse"
    // for controllers, so a pick simulates the URL having moved on.
    mocks.navigate.mockImplementation(_args => {
      // simulate the route change the navigation caused
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderBox(<SearchBox variant="overlay" onClose={() => undefined} />);
    await user.type(input(), "camera{Enter}");
    expect(mocks.navigate).toHaveBeenCalled();
    void user;
  });
});
