import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

/**
 * The three concept chips.
 *
 * They previously used `soft-button`, whose light surface is tuned for the pale
 * page — on the dark panel it read as three glowing light pills, and the copy on
 * them was pale-on-pale. They now take the panel's own inset tone and foreground,
 * so they read as restrained labels *inside* the card rather than lights on top.
 */
const chipClass =
  "absolute hidden rounded-full border border-[var(--dark-panel-inset-light)] bg-[var(--dark-panel-inset)] px-4 py-1.5 text-xs font-bold text-[var(--dark-panel-fg)] lg:block";

/**
 * Rent-to-own promotion — concept only, no financial logic (spec §25).
 * Dark panel keeps visual hierarchy distinct from product sections.
 */
export function RentToOwnSection() {
  return (
    <section
      className="dark-panel relative overflow-hidden rounded-3xl px-6 py-8 sm:px-10"
      aria-labelledby="rto-heading"
    >
      {/* Floating concept badges — staggered, subtle */}
      <motion.span
        {...fadeUp}
        transition={{ delay: 0.1, duration: 0.3 }}
        className={`${chipClass} right-6 top-6`}
      >
        Rent
      </motion.span>
      <motion.span
        {...fadeUp}
        transition={{ delay: 0.22, duration: 0.3 }}
        className={`${chipClass} right-24 top-16`}
      >
        Love it
      </motion.span>
      <motion.span
        {...fadeUp}
        transition={{ delay: 0.34, duration: 0.3 }}
        className={`${chipClass} right-10 top-28`}
      >
        Own it
      </motion.span>

      <p className="eyebrow" style={{ color: "var(--dark-panel-fg-dim)" }}>
        Rent-to-own
      </p>
      <h2
        id="rto-heading"
        className="mt-3 max-w-md font-heading text-2xl font-extrabold leading-tight sm:text-3xl"
        style={{ color: "var(--dark-panel-fg)" }}
      >
        Rent it. Love it. Own it.
      </h2>
      <p
        className="mt-3 max-w-lg text-sm leading-relaxed"
        style={{ color: "var(--dark-panel-fg-muted)" }}
      >
        Start with a rental. If it feels like yours, many sellers let you buy it later — with part
        of what you already paid credited toward the purchase.
      </p>
      <Button asChild variant="default" className="mt-5">
        <Link to="/browse" search={{ mode: "rent" }}>
          <KeyRound size={15} />
          Explore rent-to-own items
          <ArrowRight size={15} />
        </Link>
      </Button>
      <Badge
        className="ml-3 hidden bg-[var(--dark-panel-inset)] sm:inline-flex"
        style={{ color: "var(--dark-panel-fg)" }}
      >
        No commitment
      </Badge>
    </section>
  );
}
