import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ApiError } from "@/lib/api/client";

/**
 * The rentals page could not be loaded.
 *
 * The message is chosen from the error's status and never echoes a server
 * message or a stack. A 401 sends the customer to sign in; anything else offers a
 * retry, because a failed list is usually transient and retrying is the only
 * action that can help.
 */
export function RentalsErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;

  if (status === 401) {
    return (
      <div className="page-wrap py-16">
        <EmptyState
          icon={AlertTriangle}
          title="Please sign in"
          description="You need to be signed in to see your rentals."
          action={
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-wrap py-16">
      <EmptyState
        icon={AlertTriangle}
        title="We couldn't load your rentals"
        description="Something went wrong on our side. Your rentals are safe — please try again."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {onRetry && (
              <Button onClick={onRetry}>
                <RotateCcw size={14} aria-hidden="true" />
                Try again
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to="/browse" search={{ mode: "rent" }}>Browse rentals</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
