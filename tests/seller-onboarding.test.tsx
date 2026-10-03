import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BecomeSellerPage, safeRedirect } from "@/features/seller-dashboard/onboarding";

/**
 * The "start selling" page.
 *
 * ## What is being checked
 *
 * Two things the spec asks for, both easy to half-do:
 *
 * - §9: the heading reads "Sell your product" under a "SELL ON REVARO" eyebrow, not
 *   "Open your shop". This is asserted as an absence too, because renaming the
 *   heading while leaving the old string in a helper or a test would otherwise look
 *   finished.
 *
 * - §10: the reply-time field validates *inline*, against the field the cursor is
 *   still in, with the field marked `aria-invalid` and the message wired up through
 *   `aria-describedby`. The interesting part is the wiring, not the text: a message
 *   rendered next to the box is not announced, and one rendered at the bottom of the
 *   card makes a seller hunt for which of three fields is wrong.
 *
 * `safeRedirect` is here too because it is the other half of this page's safety: it
 * is what decides where a seller lands after onboarding, and an open redirect there
 * would be a phishing link the platform itself vouches for.
 */

const navigateMock = vi.hoisted(() => vi.fn());
const searchState = vi.hoisted(() => ({ current: {} as { redirect?: string } }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigateMock,
  useSearch: () => searchState.current,
}));

const becomeSellerMock = vi.hoisted(() => vi.fn());
const sellerStatusMock = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("@/features/seller-dashboard/query", () => ({
  useBecomeSeller: () => ({
    mutateAsync: becomeSellerMock,
    isPending: false,
  }),
  useSellerStatus: () => sellerStatusMock,
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  navigateMock.mockReset();
  becomeSellerMock.mockReset();
  becomeSellerMock.mockResolvedValue(undefined);
  searchState.current = {};
  sellerStatusMock.data = undefined;
});

describe("the onboarding heading", () => {
  it("says 'Sell your product' under the 'SELL ON REVARO' eyebrow", () => {
    render(<BecomeSellerPage />, { wrapper });

    expect(screen.getByRole("heading", { name: "Sell your product" })).toBeInTheDocument();
    expect(screen.getByText("Sell on Revaro")).toBeInTheDocument();
  });

  it("no longer says 'Open your shop' anywhere", () => {
    render(<BecomeSellerPage />, { wrapper });

    expect(screen.queryByText(/open your shop/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /open your shop/i })).not.toBeInTheDocument();
  });

  it("keeps the form's structure — three fields and one submit", () => {
    render(<BecomeSellerPage />, { wrapper });

    expect(screen.getByLabelText(/Where are you based/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tell buyers about your shop/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Typical reply time/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start selling" })).toBeInTheDocument();
  });

  it("says which fields are optional", () => {
    render(<BecomeSellerPage />, { wrapper });

    // Two of the three are optional, and the page has to say so rather than let a
    // seller conclude all three are required and abandon the form.
    expect(screen.getByText(/Optional for now/)).toBeInTheDocument();
    expect(screen.getByText(/Leave it blank/)).toBeInTheDocument();
  });
});

describe("the reply-time field's validation", () => {
  const input = () => screen.getByLabelText(/Typical reply time/);

  it("says nothing is wrong before anything has been typed", () => {
    render(<BecomeSellerPage />, { wrapper });

    // An untouched optional field flagged as invalid reads as "you already made a
    // mistake", which is not a feeling to hand someone on arrival.
    expect(input()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText(/In hours, 1 to 168/)).toBeInTheDocument();
  });

  it("reports a value below the minimum against the field itself", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "0");

    await waitFor(() => expect(input()).toHaveAttribute("aria-invalid", "true"));
    // The error has to *replace* the hint, not sit beside it: both at once and the
    // seller reads the reassuring one.
    expect(screen.queryByText(/In hours, 1 to 168/)).not.toBeInTheDocument();
  });

  it("reports a value above the maximum", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "200");

    await waitFor(() => expect(input()).toHaveAttribute("aria-invalid", "true"));
  });

  it("rejects a decimal, because the column is an integer", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "6.5");

    // `Number.isInteger` rather than a range check: 6.5 is within 1–168 and would
    // pass, then be truncated or rejected by the database with an error message
    // about a column the seller never knew existed.
    await waitFor(() => expect(input()).toHaveAttribute("aria-invalid", "true"));
  });

  it("clears the error once the value is valid", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "0");
    await waitFor(() => expect(input()).toHaveAttribute("aria-invalid", "true"));

    await user.clear(input());
    await user.type(input(), "6");

    await waitFor(() => expect(input()).not.toHaveAttribute("aria-invalid"));
    expect(screen.getByText(/In hours, 1 to 168/)).toBeInTheDocument();
  });

  it("treats a blank field as valid, not as zero", () => {
    render(<BecomeSellerPage />, { wrapper });

    expect(input()).not.toHaveAttribute("aria-invalid");
  });

  it("refuses to submit an invalid value rather than letting the server reject it", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "999");
    await user.click(screen.getByRole("button", { name: "Start selling" }));

    // Submitting anyway would turn a field-level mistake into a round trip and a
    // generic failure message. The page knows it is wrong; it should say so first.
    expect(becomeSellerMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/whole number of hours/);
  });

  it("announces the error through the field, not only beside it", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "999");

    // `aria-describedby` is what makes a screen reader read the message when focus
    // reaches the field, rather than leaving it to be found visually.
    await waitFor(() => {
      const describedBy = input().getAttribute("aria-describedby");
      expect(describedBy).toBe("seller-hours-error");
      const target = document.getElementById(describedBy!);
      expect(target?.textContent).toMatch(/whole number of hours/);
    });
  });

  it("submits a valid value and moves on", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(input(), "6");
    await user.click(screen.getByRole("button", { name: "Start selling" }));

    await waitFor(() =>
      expect(becomeSellerMock).toHaveBeenCalledWith({
        location: undefined,
        bio: undefined,
        responseRateHours: 6,
      }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });

  it("trims what it sends", async () => {
    const user = userEvent.setup();
    render(<BecomeSellerPage />, { wrapper });

    await user.type(screen.getByLabelText(/Where are you based/), "  Koramangala  ");
    await user.click(screen.getByRole("button", { name: "Start selling" }));

    // A leading space in a location breaks the neighbourhood filter it feeds, and
    // shows up on the shopfront as "Koramangala  " with a ragged edge.
    await waitFor(() =>
      expect(becomeSellerMock).toHaveBeenCalledWith(
        expect.objectContaining({ location: "Koramangala" }),
      ),
    );
  });
});

describe("where onboarding sends the seller", () => {
  it("honours a same-origin redirect", () => {
    expect(safeRedirect("/dashboard/listings", "/dashboard")).toBe("/dashboard/listings");
  });

  it("falls back when there is nothing to honour", () => {
    expect(safeRedirect(undefined, "/dashboard")).toBe("/dashboard");
    expect(safeRedirect("", "/dashboard")).toBe("/dashboard");
  });

  it("refuses an absolute URL on another origin", () => {
    // An open redirect here is a phishing link the platform vouches for: the seller
    // arrives at a lookalike login page by following a link from Revaro itself.
    expect(safeRedirect("https://evil.example/login", "/dashboard")).toBe("/dashboard");
    expect(safeRedirect("http://evil.example", "/dashboard")).toBe("/dashboard");
  });

  it("refuses protocol-relative URLs that look like absolute paths", () => {
    // `//evil.example` and `/\evil.example` both navigate off-origin while passing a
    // naive `startsWith("/")` check. Both are why the check is a segment test rather
    // than a prefix test.
    expect(safeRedirect("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeRedirect("/\\evil.example", "/dashboard")).toBe("/dashboard");
  });

  it("refuses a relative path, which would resolve against the current route", () => {
    expect(safeRedirect("products", "/dashboard")).toBe("/dashboard");
    expect(safeRedirect("../..", "/dashboard")).toBe("/dashboard");
  });
});