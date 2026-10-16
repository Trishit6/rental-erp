import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Highlight, highlightSegments } from "@/components/shared/search/highlight";

/**
 * PROMPT R11 — the highlight helper.
 *
 * The one non-negotiable: suggestion text arrives from the database and can
 * contain HTML. The renderer must split into React nodes so React escapes
 * everything; a `<script>` in a product title can only ever be visible text,
 * never executed. And positions come from case-insensitive matching of the
 * query's own tokens, so `"cam"` marks `Cameras` and `CAM` alike.
 */

describe("highlightSegments", () => {
  it("marks each query token, case-insensitively, keeping original characters", () => {
    // The match is the *query prefix* ("cam" in "Cameras") — not whole words —
    // and the marked slice keeps the original capitalisation.
    const segments = highlightSegments("Smart Cameras & Gear", "cam gear");
    expect(segments).toEqual([
      { value: "Smart ", matched: false },
      { value: "Cam", matched: true },
      { value: "eras & ", matched: false },
      { value: "Gear", matched: true },
    ]);
  });

  it("marks the first occurrence of each token, keeping original characters", () => {
    const segments = highlightSegments("BestLAPTOPules? No — best laptop deals", "best lap");
    expect(segments.some((segment) => segment.matched && segment.value === "Best")).toBe(true);
    expect(segments.some((segment) => segment.matched && segment.value === "LAP")).toBe(true);
  });

  it("returns the text untouched when nothing matches", () => {
    expect(highlightSegments("Sonos speaker", "nikon")).toEqual([
      { value: "Sonos speaker", matched: false },
    ]);
  });
});

describe('<Highlight> is inert by construction', () => {
  it("renders a <script> title as escaped text — never a script node", () => {
    const { getByRole, container, getByText } = render(
      <Highlight text={'<script>alert(1)</script> Sony A7'} query="sony" />,
    );

    // The matched part is marked; the injected markup is only ever text.
    expect(getByRole("mark").textContent).toBe("Sony");

    // No script element anywhere in the rendered tree, and the raw text is intact.
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("marks nothing when the query has no word characters", () => {
    const { container } = render(<Highlight text="Plain text" query="  ...  " />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Plain text");
  });
});
