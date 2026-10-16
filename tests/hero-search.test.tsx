import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeroSearch } from "@/features/home/components/HeroSearch";

/**
 * The homepage search bar (PROMPT R11 — the ONE search system, hero variant).
 *
 * ## What this pins down
 *
 * Since R11 the hero box is the shared `SearchBox` in its `hero` variant, and
 * it still has exactly one job at its edge: turn a typed term into a
 * navigation to the one discovery route, `/browse?search=<term>` — the same
 * `search` parameter Browse parses with `parseProductSearch`. The URL contract
 * is asserted here and again in `tests/search-box.test.tsx`.
 *
 *  - Enter and the arrow button both submit.
 *  - a blank or whitespace-only box submits nothing, so it can never land a
 *    visitor on an unfiltered catalogue because they leaned on the space bar;
 *  - the term is trimmed, so `"  camera  "` and `"camera"` are the same search;
 *  - the clear button empties the field, which disables the submit control.
 *
 * `useNavigate` is mocked so the argument can be asserted; `useAuth` is mocked
 * to the guest so the history write stays in the in-memory session list (no
 * network); the queries run on a throwaway client with `retry: false`.
 */

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.navigate.mockResolvedValue(undefined);
});

function renderHero() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HeroSearch />
    </QueryClientProvider>,
  );
}

function searchBox() {
  return screen.getByRole("searchbox", { name: "Search the marketplace" });
}

describe("the hero search bar", () => {
  it("renders one labelled field and one submit control inside the collapse anchor", () => {
    renderHero();

    expect(searchBox()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    // The anchor the navbar collapse watches — without it the homepage would
    // show two search bars at once whenever the observer finds nothing.
    expect(document.getElementById("hero-search")).toBeTruthy();
  });

  it("navigates to Browse with the term when Enter is pressed", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.type(searchBox(), "camera{Enter}");

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "camera" },
      }),
    );
  });

  it("navigates to Browse with the term when the submit button is clicked", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.type(searchBox(), "camera");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "camera" },
      }),
    );
  });

  it("trims leading and trailing whitespace before searching", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.type(searchBox(), "  camera  {Enter}");

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "camera" },
      }),
    );
  });

  it("does not search an empty box", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.type(searchBox(), "{Enter}");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not search a whitespace-only box", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.type(searchBox(), "   {Enter}");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("clears the field with the clear button and disables the submit control again", async () => {
    const user = userEvent.setup();
    renderHero();

    const box = searchBox();
    await user.type(box, "hello");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(box).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();

    // And nothing navigates afterwards.
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
