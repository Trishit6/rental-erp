import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Long enough to be worth collapsing. Short copy is never hidden behind a toggle. */
const COLLAPSE_THRESHOLD = 320;

export function ProductDescription({
  description,
  tags = [],
}: {
  description: string;
  tags?: string[];
}) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const collapsible = description.length > COLLAPSE_THRESHOLD;
  const visible =
    collapsible && !expanded
      ? `${description.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…`
      : description;

  return (
    <section aria-labelledby="description-heading" className="space-y-3">
      <h2 id="description-heading" className="font-heading text-lg font-extrabold">
        About this item
      </h2>

      <motion.p
        key={collapsible && !expanded ? "collapsed" : "expanded"}
        initial={reduceMotion ? false : { opacity: 0.4, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
      >
        {visible}
      </motion.p>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-full text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {expanded ? "Show less" : "Read more"}
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="inline-flex"
            aria-hidden
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <Badge key={tag} className="bg-background font-semibold text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}
