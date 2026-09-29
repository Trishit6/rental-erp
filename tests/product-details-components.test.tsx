import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvailabilityStatus } from "@/features/product-details/components/AvailabilityStatus";
import { FavoriteControl } from "@/features/favorites/components/FavoriteButton";
import { ListingModeSelector } from "@/features/product-details/components/ListingModeSelector";
import { ProductActions } from "@/features/product-details/components/ProductActions";
import { ProductCondition } from "@/features/product-details/components/ProductCondition";
import { ProductDescription } from "@/features/product-details/components/ProductDescription";
import { ProductDetailsEmpty } from "@/features/product-details/components/ProductDetailsEmpty";
import { ProductDetailsError } from "@/features/product-details/components/ProductDetailsError";
import { ProductDetailsSkeleton } from "@/features/product-details/components/ProductDetailsSkeleton";
import { ProductGallery } from "@/features/product-details/components/ProductGallery";
import { ProductSpecifications } from "@/features/product-details/components/ProductSpecifications";
import { RentalDurationSelector } from "@/features/product-details/components/RentalDurationSelector";
import { ReviewSummary } from "@/features/product-details/components/ReviewSummary";
import { buildRentalOptions } from "@/features/product-details/components/schema";
import { makeProduct } from "./support/product-fixtures";

/**
 * The leaf components only ever render links from the router, so a plain anchor
 * stands in for `Link` and keeps these tests free of a router instance.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const FROM = new Date("2026-02-01T00:00:00.000Z");

describe("ProductActions", () => {
  it("offers the purchase actions for a buyable item", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const product = makeProduct({ listingType: "SALE", rentalPricePerDay: null, availableQuantity: 5 });

    render(
      <ProductActions
        product={product}
        mode="BUY"
        available
        quantity={1}
        onQuantityChange={vi.fn()}
        onAction={onAction}
        pendingActionId={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Add to cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy now" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: "add-to-cart" }));
  });

  it("offers the rental actions for a rentable item", () => {
    render(
      <ProductActions
        product={makeProduct({ listingType: "RENT", purchasePrice: null })}
        mode="RENT"
        available
        quantity={1}
        onQuantityChange={vi.fn()}
        onAction={vi.fn()}
        pendingActionId={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Add rental to cart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rent now" })).toBeInTheDocument();
  });

  it("replaces every action with an unavailable notice", () => {
    render(
      <ProductActions
        product={makeProduct()}
        mode="BUY"
        available={false}
        quantity={1}
        onQuantityChange={vi.fn()}
        onAction={vi.fn()}
        pendingActionId={null}
      />,
    );

    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cart/i })).not.toBeInTheDocument();
  });

  it("cannot lower the quantity below one", () => {
    render(
      <ProductActions
        product={makeProduct({ availableQuantity: 5 })}
        mode="BUY"
        available
        quantity={1}
        onQuantityChange={vi.fn()}
        onAction={vi.fn()}
        pendingActionId={null}
      />,
    );

    expect(screen.getByLabelText("Decrease quantity")).toBeDisabled();
  });

  it("cannot raise the quantity above what is available", () => {
    render(
      <ProductActions
        product={makeProduct({ availableQuantity: 2 })}
        mode="BUY"
        available
        quantity={2}
        onQuantityChange={vi.fn()}
        onAction={vi.fn()}
        pendingActionId={null}
      />,
    );

    expect(screen.getByLabelText("Increase quantity")).toBeDisabled();
    expect(screen.getByText("Only 2 left")).toBeInTheDocument();
  });

  it("stops a second submission while one is pending", () => {
    render(
      <ProductActions
        product={makeProduct()}
        mode="BUY"
        available
        quantity={1}
        onQuantityChange={vi.fn()}
        onAction={vi.fn()}
        pendingActionId="add-to-cart"
      />,
    );

    // The pending button advertises that it is busy; the others are locked out
    // so a second request cannot be fired.
    expect(screen.getByRole("button", { name: "Adding…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Buy now" })).toBeDisabled();
  });
});

describe("ListingModeSelector", () => {
  it("renders only the modes the product supports and reports a switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ListingModeSelector modes={["RENT", "BUY"]} value="RENT" onChange={onChange} />);

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "Rent" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Buy" })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("radio", { name: "Buy" }));
    expect(onChange).toHaveBeenCalledWith("BUY");
  });

  it("renders nothing when there is no choice to make", () => {
    const { container } = render(
      <ListingModeSelector modes={["RENT"]} value="RENT" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RentalDurationSelector", () => {
  it("shows the selectable durations and the resulting subtotal", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const product = makeProduct();

    render(
      <RentalDurationSelector
        product={product}
        options={buildRentalOptions(product, FROM)}
        value={1}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radio", { name: "1 day" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByText(/₹499 × 1 day = ₹499/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "7 days" }));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("flags while a rental window is being checked", () => {
    const product = makeProduct();
    render(
      <RentalDurationSelector
        product={product}
        options={buildRentalOptions(product, FROM)}
        value={1}
        onChange={vi.fn()}
        checking
      />,
    );
    expect(screen.getByText(/Checking dates/)).toBeInTheDocument();
  });

  it("renders nothing when no duration can be offered", () => {
    const { container } = render(
      <RentalDurationSelector product={makeProduct()} options={[]} value={null} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AvailabilityStatus", () => {
  it("labels each state with a word, not just a colour", () => {
    const { rerender } = render(<AvailabilityStatus state="AVAILABLE" />);
    expect(screen.getByRole("status")).toHaveTextContent("Available");

    rerender(<AvailabilityStatus state="LIMITED" detail="1 of 3 free for these dates" />);
    expect(screen.getByRole("status")).toHaveTextContent("Limited availability");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 free for these dates");

    rerender(<AvailabilityStatus state="OUT_OF_STOCK" />);
    expect(screen.getByRole("status")).toHaveTextContent("Out of stock");

    rerender(<AvailabilityStatus state="UNAVAILABLE" />);
    expect(screen.getByRole("status")).toHaveTextContent("Currently unavailable");
  });
});

describe("ProductCondition", () => {
  it("uses the database condition vocabulary", () => {
    const { rerender } = render(<ProductCondition condition="LIKE_NEW" />);
    expect(screen.getByText("Like new")).toBeInTheDocument();

    rerender(<ProductCondition condition="NEW" showIcon />);
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});

describe("FavoriteControl", () => {
  it("reflects the saved state and reports a toggle", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <FavoriteControl
        title="Sony WH-1000XM5"
        isFavorited={false}
        isPending={false}
        isDisabled={false}
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: "Add Sony WH-1000XM5 to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows the saved state and disables while pending", () => {
    render(
      <FavoriteControl
        title="Sony WH-1000XM5"
        isFavorited
        isPending
        isDisabled
        variant="labelled"
        onClick={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from favorites" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Saving…");
  });

  it("uses a different accessible label for each state", () => {
    const { rerender } = render(
      <FavoriteControl
        title="Canon EOS R6"
        isFavorited={false}
        isPending={false}
        isDisabled={false}
        onClick={vi.fn()}
      />,
    );
    const add = screen.getByRole("button", { name: "Add Canon EOS R6 to favorites" });
    expect(add).toHaveAttribute("aria-pressed", "false");

    rerender(
      <FavoriteControl
        title="Canon EOS R6"
        isFavorited
        isPending={false}
        isDisabled={false}
        onClick={vi.fn()}
      />,
    );
    const remove = screen.getByRole("button", { name: "Remove Canon EOS R6 from favorites" });
    expect(remove).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ReviewSummary", () => {
  it("invites the first review when there are none", () => {
    render(<ReviewSummary summary={{ average: 0, count: 0, distribution: [] }} />);
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
  });

  it("shows the average and the distribution once reviews exist", () => {
    render(
      <ReviewSummary
        summary={{
          average: 4.8,
          count: 128,
          distribution: [
            { stars: 5, count: 100, share: 0.78 },
            { stars: 4, count: 28, share: 0.22 },
          ],
        }}
      />,
    );

    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText("128 reviews")).toBeInTheDocument();
    expect(screen.getByText("5 ★")).toBeInTheDocument();
  });
});

describe("ProductSpecifications", () => {
  it("renders the rows the backend returned", () => {
    render(
      <ProductSpecifications
        rows={[
          { label: "Brand", value: "Sony" },
          { label: "Condition", value: "Like new" },
        ]}
      />,
    );
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Sony")).toBeInTheDocument();
  });

  it("renders nothing at all when there is nothing to show", () => {
    const { container } = render(<ProductSpecifications rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProductDescription", () => {
  it("never hides short copy behind a toggle", () => {
    render(<ProductDescription description="A short description." />);
    expect(screen.queryByRole("button", { name: /read more/i })).not.toBeInTheDocument();
  });

  it("expands and collapses long copy", async () => {
    const user = userEvent.setup();
    render(<ProductDescription description={"long ".repeat(100)} />);

    const toggle = screen.getByRole("button", { name: /read more/i });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });
});

describe("ProductGallery", () => {
  it("navigates between images and keeps a position indicator", async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={makeProduct().images} title="Headphones" />);

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByAltText("Headphones — image 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});

describe("page states", () => {
  it("renders a layout-shaped skeleton while loading", () => {
    const { container } = render(<ProductDetailsSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("offers a retry that refetches instead of reloading", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ProductDetailsError onRetry={onRetry} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sends a missing product back to browse", () => {
    render(<ProductDetailsEmpty />);
    expect(screen.getByText("Product not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to browse" })).toHaveAttribute("href", "/browse");
  });
});
