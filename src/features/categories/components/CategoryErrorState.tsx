import { Link } from "@tanstack/react-router";
import { Compass, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * A category or its results failed to load. "Try again" refetches only the query
 * that failed — the app is never reloaded and the visitor's filters are untouched.
 */
export function CategoryErrorState({
  onRetry,
  title = "Unable to load this category",
  description = "Something went wrong on our side. Your filters are still here — try again.",
}: {
  onRetry: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={WifiOff}
      title={title}
      description={description}
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/**
 * The category slug doesn't exist (or is no longer active) — the backend answers
 * 404, and retrying would never help, so this offers a way onward instead.
 */
export function CategoryNotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Category not found"
      description="This category may have been removed or is no longer available."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm">
            <Link to="/categories">Explore categories</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/browse">Browse all products</Link>
          </Button>
        </div>
      }
    />
  );
}
