import { Link } from "@tanstack/react-router";
import { CalendarRange, SearchX, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Four genuinely different empty states.
 *
 * Collapsing them into one message is the classic empty-state bug: telling
 * someone with three active rentals that they have "no rentals" because a filter
 * is applied is plainly false, and "no upcoming rentals" is reassuring where "no
 * rentals at all" would be alarming.
 */
export function RentalsEmptyState({
  variant,
  bucket,
  onClearFilters,
}: {
  /** `none` when they have no rentals at all; `filtered` when filters hid them. */
  variant: "none" | "filtered";
  /** Which tab was empty, so the message fits the tab. */
  bucket?: string;
  onClearFilters?: () => void;
}) {
  if (variant === "filtered") {
    return (
      <EmptyState
        icon={SearchX}
        title="No rentals found"
        description="Try changing your search or filters."
        action={
          onClearFilters ? <Button onClick={onClearFilters}>Clear filters</Button> : undefined
        }
      />
    );
  }

  if (bucket === "active") {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No active rentals"
        description="Your current rentals will appear here."
        action={
          <Button asChild variant="secondary">
            <Link to="/browse" search={{ mode: "rent" }}>
              Browse rentals
            </Link>
          </Button>
        }
      />
    );
  }

  if (bucket === "upcoming") {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No upcoming rentals"
        description="Nothing booked yet for a future date."
        action={
          <Button asChild variant="secondary">
            <Link to="/browse" search={{ mode: "rent" }}>
              Browse rentals
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={ShoppingBag}
      title="No rentals yet"
      description="Rent something you need without committing to ownership."
      action={
        <Button asChild>
          <Link to="/browse" search={{ mode: "rent" }}>
            Browse rentals
          </Link>
        </Button>
      }
    />
  );
}
