import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { ProductGallery } from "./components/ProductGallery";
import { ProductInfo } from "./components/ProductInfo";
import { ProductPricing } from "./components/ProductPricing";
import { ListingModeSelector } from "./components/ListingModeSelector";
import { RentalDurationSelector } from "./components/RentalDurationSelector";
import { ProductActions } from "./components/ProductActions";
import { MobileProductActions } from "./components/MobileProductActions";
import { SellerCard } from "./components/SellerCard";
import { ProductDescription } from "./components/ProductDescription";
import { ProductSpecifications } from "./components/ProductSpecifications";
import { ReviewSection } from "@/features/reviews";
import { RelatedProducts } from "./components/RelatedProducts";
import { ProductDetailsSkeleton } from "./components/ProductDetailsSkeleton";
import { ProductDetailsError } from "./components/ProductDetailsError";
import { ProductDetailsEmpty } from "./components/ProductDetailsEmpty";
import {
  buildRentalOptions,
  clampQuantity,
  clampRentalDays,
  findRentalOption,
  isRentable,
  productIdSchema,
  productSpecifications,
  resolveListingMode,
  resolveRentalDays,
  stockState,
  supportedModes,
} from "./components/schema";
import { useFavoriteToggle } from "@/lib/query/favorites";
import {
  useCachedProductPreview,
  useProductActions,
  useProductAvailability,
  useProductDetail,
} from "./query";
import type { ListingMode } from "./types";

/**
 * Product details page.
 *
 * Composition only: every piece of logic lives in `./query` (server state and
 * mutations), `./components/schema` (pricing, modes, quantities) or a component
 * of its own. This file wires them together and owns the small amount of
 * transient UI state the page itself needs.
 */
export function ProductPage() {
  const { slug } = useParams({ from: "/product/$slug" });
  const reduceMotion = useReducedMotion();

  // A reference reaches the backend straight from the URL — validate before it leaves.
  const validReference = useMemo(() => productIdSchema.safeParse(slug).success, [slug]);

  const detail = useProductDetail(slug, validReference);
  const product = detail.data;
  const preview = useCachedProductPreview(slug);
  // One controller, two controls (the header heart and the mobile bar) — they
  // can never run two mutations or disagree about the pending state.
  const favorite = useFavoriteToggle({ productId: product?.id, slug });

  const [selectedMode, setSelectedMode] = useState<ListingMode | null>(null);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [actionsVisible, setActionsVisible] = useState(false);

  const actionsRef = useRef<HTMLDivElement>(null);

  const modes = useMemo(() => (product ? supportedModes(product) : []), [product]);
  const mode = product ? resolveListingMode(product, selectedMode) : null;

  const rentalOptions = useMemo(() => (product ? buildRentalOptions(product) : []), [product]);
  const activeDays = resolveRentalDays(rentalOptions, selectedDays);
  const rentalOption = findRentalOption(rentalOptions, activeDays);

  const checksRental = !!product && mode !== null && mode !== "BUY" && isRentable(product);
  const availability = useProductAvailability(
    slug,
    rentalOption ? { startDate: rentalOption.startDate, endDate: rentalOption.endDate } : undefined,
    validReference && checksRental,
  );
  const rentalInfo = availability.data;

  const cart = useProductActions({ product, quantity, rentalOption });

  // The inline action bar slides off the top of the viewport; only then does the
  // sticky mobile bar appear. Nothing is measured until the page has rendered.
  useEffect(() => {
    const element = actionsRef.current;
    if (!element) return;

    const onScroll = () => setActionsVisible(element.getBoundingClientRect().bottom < 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [product]);

  if (detail.isLoading) return <ProductDetailsSkeleton preview={preview} />;

  if (detail.isError) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    if (missing) return <ProductDetailsEmpty />;
    return <ProductDetailsError onRetry={() => void detail.refetch()} />;
  }

  if (!product || !mode) return <ProductDetailsEmpty />;

  const stock = stockState(product, product.availableQuantity);
  const stockAvailable = stock === "AVAILABLE" || stock === "LIMITED";
  const rentalBooked = checksRental && !!rentalInfo && !rentalInfo.isAvailable;
  const available =
    mode === "RENT" ? (rentalInfo ? rentalInfo.isAvailable : stockAvailable) : stockAvailable;

  const stockDetail =
    checksRental && rentalInfo
      ? `${rentalInfo.availableUnits} of ${rentalInfo.totalUnits} free for these dates`
      : undefined;

  const specifications = productSpecifications(product);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, url });
        return;
      } catch (error) {
        // The visitor dismissed the sheet — that is not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Product link copied");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
      className="page-wrap space-y-8 pb-28 pt-8 lg:pb-16"
    >
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/browse"
          className="nav-link inline-flex items-center gap-1.5 text-sm font-semibold"
        >
          <ArrowLeft size={15} aria-hidden />
          Back to browse
        </Link>
        <Button variant="secondary" size="sm" onClick={handleShare}>
          <Share2 size={14} aria-hidden />
          Share
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <ProductGallery images={product.images} title={product.title} />

        <div className="space-y-5">
          <ProductInfo
            product={product}
            stock={stock}
            stockDetail={stockDetail}
            favorite={favorite}
          />

          <ProductPricing
            product={product}
            mode={mode}
            rentalOption={rentalOption}
            quantity={quantity}
          />

          <ListingModeSelector modes={modes} value={mode} onChange={setSelectedMode} />

          {mode !== "BUY" && isRentable(product) && (
            <RentalDurationSelector
              product={product}
              options={rentalOptions}
              value={activeDays}
              onChange={(days) => setSelectedDays(clampRentalDays(days, product))}
              checking={availability.isFetching}
              unavailable={rentalBooked}
            />
          )}

          <div ref={actionsRef}>
            <ProductActions
              product={product}
              mode={mode}
              available={available}
              quantity={quantity}
              onQuantityChange={(next) =>
                setQuantity(clampQuantity(next, product.availableQuantity))
              }
              onAction={cart.run}
              pendingActionId={cart.pendingActionId}
            />
          </div>

          {product.seller && <SellerCard seller={product.seller} productId={product.id} />}
        </div>
      </div>

      <ProductDescription description={product.description} tags={product.tags} />
      <ProductSpecifications rows={specifications} />
      {/* The review section fetches on its own: filters and pagination must not
          re-run the product query, and a review write must not invalidate it. */}
      <ReviewSection productIdOrSlug={slug} />
      <RelatedProducts productIdOrSlug={slug} categoryName={product.categoryName} />

      <MobileProductActions
        mode={mode}
        available={available}
        visible={actionsVisible}
        title={product.title}
        favorite={favorite}
        onAction={cart.run}
        pendingActionId={cart.pendingActionId}
      />

      {/* No page-level back-to-top here. This used to be a fourth copy pinned at
          `bottom-6 right-6`, which is the corner the global floating rail now
          owns — and `GoToTop` already covers every page, appearing only once the
          visitor has actually scrolled. */}
    </motion.div>
  );
}
