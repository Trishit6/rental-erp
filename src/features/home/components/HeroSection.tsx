import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Leaf, MapPin, Repeat, ShieldCheck, Star, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MarketplaceStats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroSearch } from "./HeroSearch";
import { TrustPoint } from "./TrustPoint";

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

export function HeroSection({ stats }: { stats?: MarketplaceStats }) {
  return (
    <section className="raised-surface grid items-center gap-7 rounded-[32px] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:p-10">
      <div className="py-2">
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Badge className="gap-2 px-4 py-2">
            <span className="size-2 rounded-full bg-primary" />
            {stats
              ? `${stats.activeListings} neighbours sharing near you`
              : "Neighbours sharing near you"}
          </Badge>
        </motion.div>

        <motion.h1
          {...fadeUp}
          transition={{ delay: 0.08, duration: 0.3, ease: "easeOut" }}
          className="mt-5 max-w-xl font-heading text-4xl font-black leading-[1.06] tracking-tight sm:text-5xl"
        >
          Rent it for the weekend. <span className="text-primary">Own it for life.</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ delay: 0.16, duration: 0.3, ease: "easeOut" }}
          className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground"
        >
          Rent what you need, buy pre-loved, and give your own things a second life — all with
          neighbours nearby.
        </motion.p>

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
          <div className="relative overflow-hidden rounded-[22px]">
            <img
              src="https://storage.googleapis.com/banani-generated-images/generated-images/91925daa-c0cc-4433-acd1-386d9d547a41.jpg"
              alt="A soft, sculptural lounge chair ready for a new home"
              className="aspect-[4/3] w-full object-cover"
            />
            <Badge className="absolute left-4 top-4 gap-2 bg-background/90 px-3 py-2 text-foreground">
              <span className="size-2 rounded-full bg-accent" />
              Rent from ₹180/day
            </Badge>
            <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
              <div>
                <p className="text-xs font-medium text-muted-foreground">A neighbour's favourite</p>
                <p className="font-heading text-sm font-extrabold">Scandinavian lounge chair</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold">
                <Star size={13} className="fill-primary text-primary" />
                4.9
              </span>
            </div>
          </div>
        </motion.div>

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
