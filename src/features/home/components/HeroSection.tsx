import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight, Leaf, MapPin, Repeat, ShieldCheck, Star, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { MarketplaceStats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroSearch } from "./HeroSearch";
import { TrustPoint } from "./TrustPoint";
import { HERO_SLIDES, useHeroSlides, useHeroSwipe } from "./schema";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/** Floating trust badges around the hero composition — max 3 (spec §16). */
function FloatingBadge({
  icon: Icon,
  label,
  className,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  className: string;
  delay: number;
}) {
  return (
    <motion.span
      {...fadeUp}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
      className={`soft-button absolute z-10 hidden items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-foreground md:flex ${className}`}
    >
      <Icon size={14} className="text-primary" aria-hidden />
      {label}
    </motion.span>
  );
}

/**
 * The hero — same composition, living imagery.
 *
 * The headline copy, search, CTAs and trust points keep their places; only the
 * headline text and the image rotate through four marketplace scenarios. The
 * aspect-ratio box is fixed so images of any size cannot shift the layout, the
 * next slide's image is preloaded, and auto-advance stops on hover and for
 * reduced-motion users.
 */
export function HeroSection({ stats }: { stats?: MarketplaceStats }) {
  const prefersReducedMotion = useReducedMotion();
  const slides = HERO_SLIDES;
  const { index, next, previous, goTo, setPaused } = useHeroSlides(
    slides.length,
    prefersReducedMotion,
  );
  const swipe = useHeroSwipe(next, previous);
  const [imageFailed, setImageFailed] = useState(false);

  const slide = slides[index] ?? slides[0];

  // Preload the next slide's image during idle time, so a transition never
  // waits on the network. One image ahead — not the whole deck.
  const nextSlide = slides[(index + 1) % slides.length];
  if (nextSlide && typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => {
      const img = new Image();
      img.src = nextSlide.image;
    });
  }

  return (
    <section
      className="raised-surface grid items-center gap-7 rounded-[32px] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:p-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Revaro highlights"
    >
      <div className="py-2">
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Badge className="gap-2 px-4 py-2">
            <span className="size-2 rounded-full bg-primary" />
            {stats
              ? `${stats.activeListings} neighbours sharing near you`
              : "Neighbours sharing near you"}
          </Badge>
        </motion.div>

        <div className="mt-5 max-w-xl" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={slide.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="font-heading text-4xl font-black leading-[1.06] tracking-tight sm:text-5xl"
            >
              {slide.headingA} <span className="text-primary">{slide.headingB}</span>
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className="mt-4 max-w-lg" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${slide.id}-body`}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="text-base leading-relaxed text-muted-foreground"
            >
              {slide.body}
            </motion.p>
          </AnimatePresence>
        </div>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.24, duration: 0.3, ease: "easeOut" }}
          className="mt-6 max-w-lg"
        >
          <HeroSearch />
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.32, duration: 0.3, ease: "easeOut" }}
          className="mt-5 flex flex-wrap gap-3"
        >
          <Button asChild size="lg">
            <Link to="/browse">
              <span>Browse products</span>
              <ArrowRight size={16} />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link to="/list">
              <span>Start selling</span>
              <ArrowRight size={16} />
            </Link>
          </Button>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.4, duration: 0.3, ease: "easeOut" }}
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <TrustPoint icon={ShieldCheck} title="Verified owners" detail="ID + item checked" />
          <TrustPoint icon={Truck} title="Insured delivery" detail="Door-to-door cover" />
          <TrustPoint icon={Leaf} title="2.1t CO₂ saved" detail="By reusing together" />
        </motion.div>
      </div>

      <div className="relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="inset-surface rounded-[28px] p-3"
        >
          <div
            className="relative overflow-hidden rounded-[22px]"
            {...swipe}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            {/* Fixed aspect box: no layout shift as slides change. */}
            <div className="aspect-[4/3] w-full bg-[var(--inset-bg)]">
              {imageFailed ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Star size={40} className="text-primary/40" aria-hidden />
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img
                    key={slide.id}
                    src={slide.image}
                    alt={slide.imageAlt}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    onError={() => setImageFailed(true)}
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="h-full w-full object-cover"
                  />
                </AnimatePresence>
              )}
            </div>

            <Badge className="absolute left-4 top-4 gap-2 bg-background/90 px-3 py-2 text-foreground">
              <span className="size-2 rounded-full bg-accent" />
              {slide.captionTitle}
            </Badge>

            <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{slide.captionLabel}</p>
                <p className="font-heading text-sm font-extrabold">{slide.captionTitle}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold">
                <Star size={13} className="fill-primary text-primary" />
                4.9
              </span>
            </div>

            {/* Manual controls — always rendered for a11y, visually revealed on
                hover/focus and always visible on touch screens. */}
            <div className="absolute inset-y-0 left-0 flex items-center opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 max-lg:opacity-100">
              <button
                type="button"
                onClick={previous}
                aria-label="Previous slide"
                className="soft-button mx-2 flex size-9 items-center justify-center rounded-full text-foreground"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 max-lg:opacity-100">
              <button
                type="button"
                onClick={next}
                aria-label="Next slide"
                className="soft-button mx-2 flex size-9 items-center justify-center rounded-full text-foreground"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Indicator dots — double as the a11y slide picker. */}
        <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 gap-2 lg:left-auto lg:right-8 lg:translate-x-0">
          {slides.map((entry, slideIndex) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => goTo(slideIndex)}
              aria-label={`Go to slide ${slideIndex + 1}`}
              aria-current={slideIndex === index}
              className={
                slideIndex === index
                  ? "h-2 w-6 rounded-full bg-primary transition-all"
                  : "h-2 w-2 rounded-full bg-[var(--divider)] transition-all hover:bg-primary/50"
              }
            />
          ))}
        </div>

        <FloatingBadge
          icon={Repeat}
          label="Available to rent"
          className="-left-3 top-8"
          delay={0.45}
        />
        <FloatingBadge
          icon={ShieldCheck}
          label="Verified seller"
          className="-right-2 top-1/3"
          delay={0.55}
        />
        <FloatingBadge
          icon={MapPin}
          label="Bengaluru · 2 mi"
          className="-bottom-3 left-6"
          delay={0.65}
        />
      </div>
    </section>
  );
}
