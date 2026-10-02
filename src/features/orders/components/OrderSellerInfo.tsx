import { Link } from "@tanstack/react-router";
import { BadgeCheck, Store } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import type { SellerSummary } from "../types";

/**
 * Who sold the items.
 *
 * Only public seller fields are rendered — name, avatar, verified flag. There is
 * no email, no phone and no address here, because none of those are in the
 * payload: the server selects exactly these columns for exactly this reason.
 *
 * A message-the-seller action is deliberately absent. Messaging exists as its own
 * feature and wiring a conversation from here would be implementing it, which is
 * out of scope; a button that pretended to work would be worse than no button.
 */
export function OrderSellerInfo({ sellers }: { sellers: SellerSummary[] }) {
  if (sellers.length === 0) return null;

  return (
    <section className="raised-surface p-5" aria-labelledby="order-sellers-heading">
      <h2
        id="order-sellers-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        <Store size={16} aria-hidden="true" />
        {sellers.length === 1 ? "Seller" : "Sellers"}
      </h2>

      <ul className="mt-3 space-y-3">
        {sellers.map((seller) => (
          <li key={seller.id} className="flex items-center gap-3">
            <Avatar
              name={seller.name}
              url={seller.avatarUrl}
              className="size-10 text-sm"
              fallback={<Store size={15} />}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                {seller.name}
                {seller.verified && (
                  <BadgeCheck size={13} className="shrink-0 text-accent" aria-label="Verified seller" />
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
          </li>
        ))}
      </ul>
    </section>
  );
}
