import { MapPin, Repeat, ShieldCheck, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function FloatingChip({
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

// Position map per breakpoint - guaranteed no overlap (reference)

export function HeroChips() {
  const locationLabel = "Nearby · 2 mi";
  return (
    <>
      <FloatingChip icon={Repeat} label="Available to rent" className="-left-3 top-[20%] hidden md:flex" delay={0.45} />
      <FloatingChip icon={ShieldCheck} label="Verified seller" className="-right-2 top-[33%] hidden md:flex" delay={0.55} />
      <FloatingChip icon={MapPin} label={locationLabel} className="-bottom-3 left-6 hidden md:flex" delay={0.65} />
      <FloatingChip icon={Star} label="4.9 rating" className="right-4 bottom-16 hidden md:flex" delay={0.75} />
    </>
  );
}
