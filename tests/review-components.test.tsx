import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingStars } from "@/features/reviews/components/RatingStars";
import { ReviewSummaryPanel } from "@/features/reviews/components/ReviewSummary";
import { ReviewCard } from "@/features/reviews/components/ReviewCard";
import { ReviewFilters } from "@/features/reviews/components/ReviewFilters";
import { ReviewsEmptyState, ReviewsFilteredEmptyState } from "@/features/reviews/components/ReviewStates";
import { DEFAULT_REVIEW_FILTERS, type Review, type RatingSummary } from "@/features/reviews/types";

/**
 * Component-level coverage for the review surfaces.
 *
 * These assert the things a shopper can actually perceive — the verified badge,
 * the "Edited" marker, the helpful count, the accessible names of the star
 * filters. The permission rules themselves are asserted against the *server*
 * helpers in `tests/review-queries.test.ts`, because that is where they are
 * enforced; a component test can only show that a prop was honoured.
 *
 * The mutations are mocked rather than rendered against a real query client, so
 * these tests are about the read surfaces and the gating decisions.
 */

vi.mock("@/features/reviews/query", () => ({
  useMarkHelpful: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useReplyToReview: () => ({ mutate: vi.fn(), isPending: false }),
}));

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 1,
    rating: 5,
    title: "Exactly as described",
    comment: "Arrived a day early and was spotless.",
    purchaseType: "PURCHASE",
    isVerifiedPurchase: true,
    status: "PUBLISHED",
    isEdited: false,
    helpfulCount: 3,
    viewerMarkedHelpful: false,
    images: [],
    sellerReply: null,
    sellerRepliedAt: null,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
    author: { id: 7, name: "Asha Menon", avatarUrl: null },
    product: { id: 42, title: "Sony WH-1000XM5", slug: "sony-wh-1000xm5" },
    viewerOwnsReview: false,
    orderItemId: 9,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<RatingSummary> = {}): RatingSummary {
  return {
    average: 4.8,
    count: 128,
    distribution: [
      { stars: 5, count: 100, share: 0.78 },
      { stars: 4, count: 28, share: 0.22 },
      { stars: 3, count: 0, share: 0 },
      { stars: 2, count: 0, share: 0 },
      { stars: 1, count: 0, share: 0 },
    ],
    fiveStarShare: 0.78,
    purchaseCount: 100,
    rentalCount: 28,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------- RatingStars ------------------------------- */

describe("RatingStars", () => {
  it("names the rating for a screen reader rather than leaving it to shape", () => {
    render(<RatingStars value={4.5} />);
    // Half-star rendering is decorative; the number is not.
    expect(screen.getByRole("img", { name: "5 stars" })).toBeInTheDocument();
  });

  it("uses the caller's label when one is given", () => {
    render(<RatingStars value={3} label="Average rating 3 out of 5" />);
    expect(screen.getByRole("img", { name: "Average rating 3 out of 5" })).toBeInTheDocument();
  });

  it("never claims more than five stars", () => {
    render(<RatingStars value={9} />);
    expect(screen.getByRole("img", { name: "5 stars" })).toBeInTheDocument();
  });
});

/* ------------------------------ ReviewSummaryPanel -------------------------- */

describe("ReviewSummaryPanel", () => {
  it("invites the first review when there are none", () => {
    const summary = makeSummary({
      average: 0,
      count: 0,
      distribution: [],
      fiveStarShare: 0,
      purchaseCount: 0,
      rentalCount: 0,
    });
    render(<ReviewSummaryPanel summary={summary} />);
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
    // A dash, not "0.0" — an average of nothing is not a rating of zero.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the average, the count and the distribution once reviews exist", () => {
    render(<ReviewSummaryPanel summary={makeSummary()} />);
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("128 reviews")).toBeInTheDocument();
    expect(screen.getByText("78% rated 5 stars")).toBeInTheDocument();
  });

  it("offers each distribution bar as a labelled filter button", () => {
    const onSelect = vi.fn();
    render(<ReviewSummaryPanel summary={makeSummary()} onSelectRating={onSelect} />);
    // The count is in the accessible name so the bar's width is never the only cue.
    expect(screen.getByRole("button", { name: /5 stars — 100 of 128 reviews/ })).toBeInTheDocument();
  });

  it("reports the clicked star back to the caller", async () => {
    const onSelect = vi.fn();
    render(<ReviewSummaryPanel summary={makeSummary()} onSelectRating={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /4 stars — 28 of 128 reviews/ }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("does not render filter buttons when it cannot filter", () => {
    render(<ReviewSummaryPanel summary={makeSummary()} />);
    expect(screen.queryByRole("button", { name: /5 stars —/ })).not.toBeInTheDocument();
  });
});

/* -------------------------------- ReviewCard ------------------------------- */

describe("ReviewCard", () => {
  it("shortens the author's name rather than republishing it in full", () => {
    render(<ReviewCard review={makeReview()} />);
    expect(screen.getByText("Asha M.")).toBeInTheDocument();
    expect(screen.queryByText("Asha Menon")).not.toBeInTheDocument();
  });

  it("badges a verified purchase as a purchase, and a rental as a rental", () => {
    const { rerender } = render(<ReviewCard review={makeReview({ purchaseType: "PURCHASE" })} />);
    expect(screen.getByText("Verified Purchase")).toBeInTheDocument();

    rerender(<ReviewCard review={makeReview({ purchaseType: "RENTAL" })} />);
    expect(screen.getByText("Verified Rental")).toBeInTheDocument();
  });

  it("shows no badge at all for an unverified review", () => {
    // An unverified legacy row must not be dressed up with a generic "reviewed"
    // badge — the whole value of the badge is that it is earned.
    render(<ReviewCard review={makeReview({ isVerifiedPurchase: false })} />);
    expect(screen.queryByText(/Verified/)).not.toBeInTheDocument();
  });

  it("marks an edited review", () => {
    const review = makeReview({
      isEdited: true,
      updatedAt: "2026-01-20T00:00:00.000Z",
      createdAt: "2026-01-10T00:00:00.000Z",
    });
    render(<ReviewCard review={review} />);
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("distinguishes a rating-only change from an edit of the words", () => {
    // Identical timestamps mean only the rating moved; "Edited" would overstate it.
    const review = makeReview({ isEdited: true });
    render(<ReviewCard review={review} />);
    expect(screen.getByText("Rating updated")).toBeInTheDocument();
  });

  it("does not say Edited when nothing changed", () => {
    render(<ReviewCard review={makeReview({ isEdited: false })} />);
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
    expect(screen.queryByText("Rating updated")).not.toBeInTheDocument();
  });

  it("offers Helpful to a reader and never to the author", () => {
    const { rerender } = render(<ReviewCard review={makeReview({ viewerOwnsReview: false })} />);
    expect(screen.getByRole("button", { name: /Helpful 3/ })).toBeInTheDocument();

    rerender(<ReviewCard review={makeReview({ viewerOwnsReview: true })} />);
    expect(screen.queryByRole("button", { name: /Helpful/ })).not.toBeInTheDocument();
  });

  it("offers Delete to the author only", () => {
    const { rerender } = render(<ReviewCard review={makeReview({ viewerOwnsReview: false })} />);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    rerender(<ReviewCard review={makeReview({ viewerOwnsReview: true })} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders a seller reply when there is one", () => {
    render(
      <ReviewCard
        review={makeReview({
          sellerReply: "Thanks — it is back on the shelf.",
          sellerRepliedAt: "2026-01-12T00:00:00.000Z",
        })}
      />,
    );
    expect(screen.getByText("Seller Response")).toBeInTheDocument();
    expect(screen.getByText("Thanks — it is back on the shelf.")).toBeInTheDocument();
  });

  it("says nothing about a reply when there is none", () => {
    render(<ReviewCard review={makeReview()} />);
    expect(screen.queryByText("Seller Response")).not.toBeInTheDocument();
  });

  it("names the review by its author for assistive technology", () => {
    render(<ReviewCard review={makeReview()} />);
    expect(screen.getByRole("article", { name: "Asha Menon's review" })).toBeInTheDocument();
  });
});

/* ------------------------------- ReviewFilters ------------------------------ */

describe("ReviewFilters", () => {
  it("offers exactly the sorts the API implements", () => {
    render(<ReviewFilters filters={DEFAULT_REVIEW_FILTERS} onChange={vi.fn()} />);
    const select = screen.getByLabelText("Sort") as HTMLSelectElement;
    const options = [...select.options].map((option) => option.value);
    expect(options).toEqual(["relevant", "newest", "highest", "lowest", "helpful"]);
  });

  it("announces which filter is active with aria-pressed", () => {
    render(<ReviewFilters filters={{ ...DEFAULT_REVIEW_FILTERS, rating: 4 }} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /4 Stars/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /All Ratings/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("toggles a rating off when the active one is clicked again", async () => {
    const onChange = vi.fn();
    render(<ReviewFilters filters={{ ...DEFAULT_REVIEW_FILTERS, rating: 4 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /4 Stars/ }));
    expect(onChange).toHaveBeenCalledWith({ rating: null });
  });

  it("hides a purchase-type filter with nothing behind it", () => {
    // Offering "Verified Rental" on a listing nobody rented would produce an empty
    // list rather than a filter.
    render(
      <ReviewFilters
        filters={DEFAULT_REVIEW_FILTERS}
        onChange={vi.fn()}
        purchaseCounts={{ purchase: 12, rental: 0 }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Verified Rental/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verified Purchase/ })).toBeInTheDocument();
  });

  it("shows both types when both exist", () => {
    render(
      <ReviewFilters
        filters={DEFAULT_REVIEW_FILTERS}
        onChange={vi.fn()}
        purchaseCounts={{ purchase: 12, rental: 4 }}
      />,
    );
    expect(screen.getByRole("button", { name: /Verified Rental/ })).toBeInTheDocument();
  });
});

/* -------------------------------- states ----------------------------------- */

describe("ReviewStates", () => {
  it("offers to write one when the server says the viewer may", () => {
    const onWrite = vi.fn();
    render(
      <ReviewsEmptyState
        eligibility={{ canReview: true, reason: null, orderItemId: 9, purchaseType: "PURCHASE", lines: [] }}
        onWrite={onWrite}
      />,
    );
    expect(screen.getByRole("button", { name: "Write a Review" })).toBeInTheDocument();
  });

  it("explains the refusal rather than showing a button that would 409", () => {
    render(
      <ReviewsEmptyState
        eligibility={{
          canReview: false,
          reason: "You can review an item once it has been delivered.",
          orderItemId: null,
          purchaseType: null,
          lines: [],
        }}
        onWrite={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Write a Review" })).not.toBeInTheDocument();
    expect(screen.getByText(/once it has been delivered/)).toBeInTheDocument();
  });

  it("says nothing about eligibility to a signed-out visitor", () => {
    render(<ReviewsEmptyState eligibility={null} onWrite={vi.fn()} />);
    expect(screen.queryByText(/once it has been delivered/)).not.toBeInTheDocument();
  });

  it("offers to clear filters, not to write a review, when a filter excluded everything", () => {
    // "No reviews match" and "no reviews yet" are different facts, and only the
    // second one is an invitation to write.
    render(<ReviewsFilteredEmptyState onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write a Review" })).not.toBeInTheDocument();
  });
});

/* ------------------------------ card + filters ------------------------------ */

describe("a review list rendered from real rows", () => {
  it("never lets the average disagree with the rows beneath it", () => {
    // The summary and the list arrive in one response. Rendering the summary from
    // the rows would make filtering to one star change the average to 1.0.
    const { container } = render(
      <div>
        <ReviewSummaryPanel summary={makeSummary()} />
        <ReviewCard review={makeReview({ rating: 1 })} />
      </div>,
    );
    expect(container.textContent).toContain("4.8");
    expect(within(container).getByRole("img", { name: "Rated 1 out of 5" })).toBeInTheDocument();
  });
});