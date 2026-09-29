import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sofa } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Neumorphic category tile — hover raises the card and nudges the icon.
 * Falls back to a generic icon when the category has no mapped glyph.
 */
export function CategoryCard({
  slug,
  name,
  icon: Icon = Sofa,
}: {
  slug: string;
  name: string;
  icon?: LucideIcon;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      <Link
        to="/browse"
        search={{ category: slug }}
        className="raised-surface group flex min-w-[118px] flex-col items-center gap-3 rounded-2xl px-4 py-4 transition-shadow hover:shadow-[10px_10px_26px_var(--shadow-color-dark),-10px_-10px_26px_var(--shadow-color-light)]"
      >
        <motion.span
          className="inset-surface flex size-11 items-center justify-center rounded-full text-primary"
          whileHover={{ scale: 1.08 }}
          transition={{ duration: 0.2 }}
        >
          <Icon size={19} aria-hidden />
        </motion.span>
        <span className="text-xs font-bold">{name}</span>
      </Link>
    </motion.div>
  );
}
