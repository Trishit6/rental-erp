import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroSearch } from "@/features/home/components/HeroSearch";

/**
 * The homepage search bar (PROMPT — hero search).
 *
 * ## What this pins down
 *
 * The hero box has exactly one job: turn a typed term into a navigation to the one
 * discovery route, `/browse?search=<term>`. Everything downstream — the query key, the
 * server call, the empty state — belongs to Browse and is exercised by its own suite.
 * What is easy to regress here is the *contract* at the edge:
 *
 *  - Enter and the arrow button both submit (a button wired to `onClick` and no submit
 *    is the classic "looks right, does nothing").
 *  - a blank or whitespace-only box submits nothing, so it can never land a visitor on
 *    an unfiltered catalogue because they leaned on the space bar;
 *  - the term is trimmed, so `"  camera  "` and `"camera"` are the same search;
 *  - the arrow carries a busy state while the navigation is in flight, so a double
 *    click cannot queue two navigations.
 *
 * `useNavigate` is the only thing borrowed from TanStack Router; it is mocked so the
 * argument can be asserted. Everything else — `Button`, `Input`, the Zod schema — is
 * the real component, because the point is to test what the user actually gets.
 */

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.navigate.mockResolvedValue(undefined);
});

function searchBox() {
  return screen.getByRole("searchbox", { name: "Search the marketplace" });
}

describe("the hero search bar", () => {
  it("renders one labelled field and one submit control", () => {
    render(<HeroSearch />);

    expect(searchBox()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("navigates to Browse with the term when Enter is pressed", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    await user.type(searchBox(), "camera{Enter}");

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "camera" },
      }),
    );
  });

  it("navigates to Browse with the term when the arrow button is clicked", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    await user.type(searchBox(), "gaming laptop");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "gaming laptop" },
      }),
    );
  });

  it("trims leading and trailing whitespace before searching", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    await user.type(searchBox(), "  drill  {Enter}");

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/browse",
        search: { search: "drill" },
      }),
    );
  });

  it("does not search an empty box", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();

    // Enter on an empty box still submits the form; the schema and the disabled
    // button must both refuse it.
    await user.click(searchBox());
    await user.keyboard("{Enter}");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not search a whitespace-only box", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    await user.type(searchBox(), "   ");

    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    await user.keyboard("{Enter}");

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("clears the field and re-disables search with the clear button", async () => {
    const user = userEvent.setup();
    render(<HeroSearch />);

    await user.type(searchBox(), "tent");
    expect(searchBox()).toHaveValue("tent");

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(searchBox()).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("marks the arrow busy and blocks a second navigation while travelling", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    mocks.navigate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<HeroSearch />);

    await user.type(searchBox(), "bike{Enter}");

    const submit = screen.getByRole("button", { name: "Search" });
    await waitFor(() => expect(submit).toHaveAttribute("aria-busy", "true"));
    expect(submit).toBeDisabled();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);

    release?.();
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
