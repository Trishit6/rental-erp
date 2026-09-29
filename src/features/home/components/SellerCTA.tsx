import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Camera, Check, Repeat, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const STEPS = [
  ["01", "Add details", "A title, category & price"],
  ["02", "Set your terms", "Choose rent and sale"],
  ["03", "Get paid", "Earn on every booking"],
] as const;

/**
 * Seller CTA — Snap it → Set rent + buy → Get paid (spec §27/§28).
 * Floating badges (Rent / Buy / Pre-loved) stay subtle and behind content.
 */
export function SellerCTA() {
  return (
    <section aria-labelledby="seller-cta-heading">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        {/* Floating badges — decorative, hidden on small screens */}
        <motion.span
          {...fadeUp}
          transition={{ delay: 0.15, duration: 0.3 }}
          aria-hidden
          className="soft-button absolute -right-2 top-8 hidden rotate-6 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold lg:flex"
        >
          <Repeat size={12} className="text-primary" /> Rent
        </motion.span>
        <motion.span
          {...fadeUp}
          transition={{ delay: 0.28, duration: 0.3 }}
          aria-hidden
          className="soft-button absolute -right-4 top-20 hidden -rotate-3 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold lg:flex"
        >
          <Tag size={12} className="text-primary" /> Buy
        </motion.span>
        <motion.span
          {...fadeUp}
          transition={{ delay: 0.41, duration: 0.3 }}
          aria-hidden
          className="soft-button absolute right-16 top-32 hidden rotate-2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold lg:flex"
        >
          <Camera size={12} className="text-primary" /> Pre-loved
        </motion.span>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Make space. Make money.</p>
            <h2 id="seller-cta-heading" className="mt-1 font-heading text-2xl font-extrabold">
              Sell in 60 seconds
            </h2>
          </div>
          <Badge className="bg-accent/10 text-accent">
            <Check size={13} className="mr-1" />
            Easy listing
          </Badge>
        </div>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Your idle things deserve another life. List once with both a rental and a buy-it-now price
          — then let your neighbours find them.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {STEPS.map(([number, title, description]) => (
            <div key={number} className="raised-surface rounded-2xl p-3 sm:p-4">
              <span className="font-heading text-lg font-black text-primary/50">{number}</span>
              <p className="mt-3 text-xs font-extrabold sm:text-sm">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
        <Button asChild className="mt-5">
          <Link to="/list">
            Sell an item
            <ArrowRight size={15} />
          </Link>
        </Button>
      </Card>
    </section>
  );
}
