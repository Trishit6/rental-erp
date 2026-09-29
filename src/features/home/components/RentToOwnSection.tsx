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
        className="soft-button absolute right-6 top-6 hidden rounded-full px-4 py-1.5 text-xs font-bold text-foreground lg:block"
      >
        Rent
      </motion.span>
      <motion.span
        {...fadeUp}
        transition={{ delay: 0.22, duration: 0.3 }}
        className="soft-button absolute right-24 top-16 hidden rounded-full px-4 py-1.5 text-xs font-bold text-foreground lg:block"
      >
        Love it
      </motion.span>
      <motion.span
        {...fadeUp}
        transition={{ delay: 0.34, duration: 0.3 }}
        className="soft-button absolute right-10 top-28 hidden rounded-full px-4 py-1.5 text-xs font-bold text-foreground lg:block"
      >
        Own it
      </motion.span>

      <p className="eyebrow text-primary-foreground/60" style={{ color: "rgb(255 247 237 / 60%)" }}>
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
        style={{ color: "rgb(255 247 237 / 75%)" }}
      >
        Start with a rental. If it feels like yours, many sellers let you buy it later — with part
        of what you already paid credited toward the purchase.
      </p>
      <Button asChild variant="secondary" className="mt-5">
        <Link to="/browse" search={{ mode: "rent" }}>
          <KeyRound size={15} />
          Explore rent-to-own items
          <ArrowRight size={15} />
        </Link>
      </Button>
      <Badge
        className="ml-3 hidden bg-white/10 text-primary-foreground sm:inline-flex"
        style={{ color: "var(--dark-panel-fg)" }}
      >
        No commitment
      </Badge>
    </section>
  );
}
