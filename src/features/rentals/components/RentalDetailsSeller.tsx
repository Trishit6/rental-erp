import { Link } from "@tanstack/react-router";
import { BadgeCheck, Store } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import type { RentalSeller } from "../types";

/**
 * Who you're renting from.
 *
 * Only public fields — no email, no phone, no address. They are not in the
 * payload because the server selects exactly these columns.
 *
 * There is deliberately no "message seller" button: messaging is its own
 * feature, and a control that looked like it worked but did not is worse than
 * its absence. The seller profile is the real, working destination.
 */
export function RentalDetailsSeller({ seller }: { seller: RentalSeller | null }) {
  if (!seller) return null;

  return (
    <section className="raised-surface p-5" aria-labelledby="rental-seller-heading">
      <h2
        id="rental-seller-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        <Store size={16} aria-hidden="true" />
        Owner
      </h2>

      <div className="mt-3 flex items-center gap-3">
        <Avatar
          name={seller.name}
          url={seller.avatarUrl}
          className="size-11 text-sm"
          fallback={<Store size={17} />}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
            {seller.name}
            {seller.verified && (
              <BadgeCheck size={14} className="shrink-0 text-accent" aria-label="Verified seller" />
            )}
          </p>
          <Link
            to="/seller/$id"
            params={{ id: String(seller.id) }}
            className="text-[11px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            View profile
          </Link>
        </div>
      </div>
    </section>
  );
}
