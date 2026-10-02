import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePlaceholder, ProductImage } from "@/components/shared/product-image";
import { Avatar } from "@/components/shared/avatar";
import { FloatingRail, FloatingRailProvider, FloatingSlotContent } from "@/lib/floating/rail";

/**
 * The two systems this file covers both exist because something was broken in a
 * way no assertion could see:
 *
 * - `ProductImage` because 18 of 22 demo products pointed at 403 URLs, and the
 *   old markup rendered `src=""`, which the browser answers with a broken-image
 *   icon *and* the alt text — visibly duplicating the product title on the card.
 * - `FloatingRail` because five controls each hardcoded their own corner offsets
 *   into the same place, and three of them landed on top of each other.
 */

afterEach(() => vi.restoreAllMocks());

const opacityOf = (image: HTMLElement) =>
  image.className.includes("opacity-100") ? "visible" : "hidden";

describe("ProductImage", () => {
  it("renders the image at its real size, so nothing reflows when it loads", () => {
    render(<ProductImage src="https://cdn.test/a.jpg" alt="A sofa" className="aspect-[4/3]" />);
    const image = screen.getByAltText("A sofa");
    expect(image).toHaveAttribute("src", "https://cdn.test/a.jpg");
    // The fixed box, not the photo: an `aspect-*` box is what stops the card
    // jumping when the bytes arrive.
    expect(image.parentElement).toHaveClass("relative", "size-full", "aspect-[4/3]");
  });

  it("keeps the alt text on the image and out of the visible page", () => {
    render(<ProductImage src="https://cdn.test/b.jpg" alt="Sony WH-1000XM5" />);
    // Accessible name comes from `alt`...
    expect(screen.getByAltText("Sony WH-1000XM5")).toBeInTheDocument();
    // ...and nothing paints it. A card that fails would otherwise print the
    // title twice: once as the heading, once as the fallback.
    expect(screen.queryByText("Sony WH-1000XM5")).not.toBeInTheDocument();
  });

  it("shows a placeholder, not a broken image, when there is no url", () => {
    render(<ProductImage src={null} alt="A sofa" />);
    expect(screen.queryByAltText("A sofa")).not.toBeInTheDocument();
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });

  it("treats a blank url as no url rather than as a request for the page itself", () => {
    // `src=""` resolves to the current document, which jsdom and every browser
    // answer with a broken-image icon — the original bug.
    render(<ProductImage src="   " alt="A sofa" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });

  it("starts hidden behind the placeholder and reveals on load", () => {
    render(<ProductImage src="https://cdn.test/c.jpg" alt="A sofa" />);
    const image = screen.getByAltText("A sofa");
    expect(opacityOf(image)).toBe("hidden");

    fireEvent.load(image);
    expect(opacityOf(screen.getByAltText("A sofa"))).toBe("visible");
  });

  it("swaps in the placeholder when the image errors, and keeps the alt text", () => {
    const { container } = render(
      <ProductImage src="https://cdn.test/gone.jpg" alt="A sofa" />,
    );
    fireEvent.error(screen.getByAltText("A sofa"));

    // The dead <img> is gone — a broken-image icon is never left on screen.
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });

  it("uses a caller-supplied fallback in place of the generic placeholder", () => {
    render(
      <ProductImage
        src="https://cdn.test/gone.jpg"
        alt="Laptops"
        fallback={<span>Laptop glyph</span>}
      />,
    );
    fireEvent.error(screen.getByAltText("Laptops"));
    expect(screen.getByText("Laptop glyph")).toBeInTheDocument();
    expect(screen.queryByText("Image unavailable")).not.toBeInTheDocument();
  });

  it("treats an image that was already cached as loaded", () => {
    // A cached image can be `complete` before the ref callback runs, and `load`
    // never fires for it — so without this check it would stay stuck at opacity-0.
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(function (
      this: HTMLImageElement,
    ) {
      return this.src.includes("cached");
    });
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(function (
      this: HTMLImageElement,
    ) {
      return this.src.includes("cached") ? 800 : 0;
    });

    render(<ProductImage src="https://cdn.test/cached.jpg" alt="A sofa" />);
    expect(opacityOf(screen.getByAltText("A sofa"))).toBe("visible");
  });

  it("starts over when a recycled card is given a different photo", () => {
    const { rerender } = render(<ProductImage src="https://cdn.test/one.jpg" alt="A sofa" />);
    fireEvent.load(screen.getByAltText("A sofa"));
    expect(opacityOf(screen.getByAltText("A sofa"))).toBe("visible");

    rerender(<ProductImage src="https://cdn.test/two.jpg" alt="A sofa" />);
    // Not the previous photo's "loaded": the new one has not arrived yet.
    expect(opacityOf(screen.getByAltText("A sofa"))).toBe("hidden");
  });

  it("does not inherit a previous photo's failure", () => {
    const { rerender } = render(<ProductImage src="https://cdn.test/broken.jpg" alt="A sofa" />);
    fireEvent.error(screen.getByAltText("A sofa"));
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();

    rerender(<ProductImage src="https://cdn.test/fine.jpg" alt="A sofa" />);
    expect(screen.getByAltText("A sofa")).toBeInTheDocument();
  });

  it("keeps the box the same whether it loaded or not", () => {
    const { container, rerender } = render(
      <ProductImage src="https://cdn.test/a.jpg" alt="A sofa" className="size-16 rounded-2xl" />,
    );
    const loaded = container.firstElementChild?.className;

    rerender(<ProductImage src="https://cdn.test/broken.jpg" alt="A sofa" className="size-16 rounded-2xl" />);
    fireEvent.error(screen.getByAltText("A sofa"));

    // A failure must not collapse the tile, or a grid of cards reflows.
    expect(container.firstElementChild?.className).toBe(loaded);
  });

  it("is decorative, so the image's alt text is announced once and not twice", () => {
    const { container } = render(<ImagePlaceholder />);
    // The whole placeholder is hidden from assistive tech — it is a status the
    // eye reads, and the `<img>`'s `alt` already carries the meaning.
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("shows the picture when there is one", () => {
    const { container } = render(<Avatar name="Asha Rao" url="https://cdn.test/a.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/a.jpg");
  });

  it("falls back to the initial when there is no picture", () => {
    render(<Avatar name="Asha Rao" url={null} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("falls back to the initial when the picture 404s", () => {
    // The gap every hand-rolled copy had: they checked for a missing url and
    // never a broken one, so a deleted upload showed the browser's broken-image
    // icon inside the circle.
    const { container } = render(<Avatar name="Asha Rao" url="https://cdn.test/gone.jpg" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders a caller-supplied fallback in place of the initial", () => {
    render(<Avatar name="Revaro Store" url={null} fallback={<span>shop</span>} />);
    expect(screen.getByText("shop")).toBeInTheDocument();
    expect(screen.queryByText("R")).not.toBeInTheDocument();
  });

  it("is decorative, because the name is already on screen as text", () => {
    const { container } = render(<Avatar name="Asha Rao" url={null} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("does not keep a previous person's failure on a recycled row", () => {
    const { container, rerender } = render(
      <Avatar name="Asha Rao" url="https://cdn.test/broken.jpg" />,
    );
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    rerender(<Avatar name="Ben Ortiz" url="https://cdn.test/b.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/b.jpg");
  });
});

/** Claims a slot and prints the slot's name into whatever it is given. */
function Probe({ slot, active = true }: { slot: string; active?: boolean }) {
  return (
    <FloatingSlotContent slot={slot as never} active={active}>
      <button type="button" data-testid={`probe-${slot}`}>
        {slot}
      </button>
    </FloatingSlotContent>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <FloatingRailProvider>
      {children}
      <FloatingRail />
    </FloatingRailProvider>
  );
}

/** The rail's anchors, top to bottom. */
const railOrder = () =>
  within(document.querySelector(".floating-rail") as HTMLElement)
    .getAllByRole("button")
    .map((button) => button.textContent);

describe("FloatingRail", () => {
  it("stacks slots in a fixed order regardless of which control mounts first", () => {
    // The assistant is mounted by the root layout, so it mounts *before* the home
    // dock. Without a declared order it would always land at the top of the
    // column and push the cart below it.
    render(
      <Rail>
        <Probe slot="chat" />
        <Probe slot="cart" />
        <Probe slot="sell" />
      </Rail>,
    );
    expect(railOrder()).toEqual(["cart", "sell", "chat"]);
  });

  it("places the assistant last, below everything it is positioned against", () => {
    render(
      <Rail>
        <Probe slot="top" />
        <Probe slot="chat" />
        <Probe slot="filters" />
      </Rail>,
    );
    expect(railOrder()).toEqual(["filters", "top", "chat"]);
  });

  it("renders every claimed control exactly once", () => {
    render(
      <Rail>
        <Probe slot="chat" />
        <Probe slot="cart" />
      </Rail>,
    );
    // One rail copy, and no leftover at the call site's own position in the tree.
    expect(screen.getAllByTestId("probe-cart")).toHaveLength(1);
    expect(screen.getAllByTestId("probe-chat")).toHaveLength(1);
  });

  it("releases a slot when its control goes inactive", () => {
    const { rerender } = render(
      <Rail>
        <Probe slot="cart" />
        <Probe slot="top" active />
      </Rail>,
    );
    expect(railOrder()).toEqual(["cart", "top"]);

    // Go-to-top is hidden until the page scrolls; a hidden control that kept its
    // slot would leave a permanent gap in the column.
    rerender(
      <Rail>
        <Probe slot="cart" />
        <Probe slot="top" active={false} />
      </Rail>,
    );
    expect(railOrder()).toEqual(["cart"]);
  });

  it("positions its controls in the rail, not at the corner itself", () => {
    render(
      <Rail>
        <Probe slot="chat" />
      </Rail>,
    );
    // The probe carries no `fixed` class of its own — the rail is what pins it.
    expect(screen.getByTestId("probe-chat").className).not.toContain("fixed");
    expect(screen.getByTestId("probe-chat").closest(".floating-rail")).not.toBeNull();
  });

  it("publishes its height for the chat panel to clear", () => {
    render(
      <Rail>
        <Probe slot="chat" />
      </Rail>,
    );
    // Without this the assistant panel has to hard-code an offset that goes
    // stale the moment a control is added to the column.
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--floating-rail-height")).toMatch(/px$/);
  });

  it("renders in normal flow when there is no rail, rather than vanishing", () => {
    // The honest degradation: a feature rendered on its own (a page test, or a
    // future embed) still shows its control. It is not `fixed`, so it cannot
    // overlap anything — there is simply no rail to be part of.
    render(<Probe slot="chat" />);
    const probe = screen.getByTestId("probe-chat");
    expect(probe).toBeInTheDocument();
    expect(probe.closest(".floating-rail")).toBeNull();
    expect(probe.className).not.toContain("fixed");
  });

  it("does not leave a stale anchor behind after unmount", () => {
    const { unmount } = render(
      <Rail>
        <Probe slot="cart" />
        <Probe slot="chat" />
      </Rail>,
    );
    expect(railOrder()).toEqual(["cart", "chat"]);

    unmount();
    expect(document.querySelector(".floating-rail")).toBeNull();
  });
});

describe("floating rail release order", () => {
  it("frees the slot only once the control has finished animating out", () => {
    // The release is deferred to `onExitComplete`, so the anchor has to still be
    // there for the button to animate out *into* — otherwise it vanishes mid-flight.
    function Harness() {
      const [shown, setShown] = useState(true);
      return (
        <Rail>
          <FloatingSlotContent slot="top" active={shown}>
            <span>{shown ? "Top" : null}</span>
          </FloatingSlotContent>
          <button type="button" data-testid="hide" onClick={() => setShown(false)}>
            hide
          </button>
        </Rail>
      );
    }

    render(<Harness />);
    expect(screen.getByText("Top")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hide"));
    expect(screen.queryByText("Top")).not.toBeInTheDocument();
    expect(document.querySelector(".floating-rail")).not.toBeNull();
  });
});