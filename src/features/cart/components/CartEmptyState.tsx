import { motion, useReducedMotion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * The empty cart. A real destination, not a dead end — the point of an empty
 * cart is to get the user back into the marketplace.
 */
export function CartEmptyState() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Find something to rent or buy from your neighbours, and it will wait for you here."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link to="/browse">Browse products</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/browse" search={{ mode: "rent" }}>Browse rentals</Link>
            </Button>
          </div>
        }
      />
    </motion.div>
  );
}
