import { Link } from "@tanstack/react-router";
import { PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Missing, deleted or non-public product. Shown for an invalid reference too, so
 * a malformed URL is treated as "no such product" rather than crashing.
 */
export function ProductDetailsEmpty() {
  return (
    <div className="page-wrap py-16">
      <EmptyState
        icon={PackageX}
        title="Product not found"
        description="This product may have been removed or is no longer available."
        action={
          <Button asChild>
            <Link to="/browse">Back to browse</Link>
          </Button>
        }
      />
    </div>
  );
}
