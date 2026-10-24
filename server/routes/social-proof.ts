import { Router } from "../lib/http";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orderItems, orders, products } from "../schema";
import { ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { getSetting } from "../lib/settings/service";
import {
  buildPublicProofFeed,
  dedupeEvents,
  type ProofEvent,
  type RawProofEvent,
} from "../lib/social-proof";

/**
 * `GET /api/social-proof/recent` (U4 effect 03).
 *
 * The one public, deliberately coarse surface about recent activity. Every
 * privacy guarantee lives in `lib/social-proof.ts`; this handler only gathers
 * candidates (paid order lines and newly published listings for public
 * products), dedupes per (kind, product), and runs them through the pure
 * filter before returning.
 *
 * Gating is three-layered: the `socialProof.enabled` R13 setting (an admin
 * kill switch for the whole feed), the `fx.salePings` client flag (a rendering
 * kill switch the client checks before it even mounts the component), and the
 * rate-limit budget. With the setting off this still returns `{ events: [] }`
 * — an explicit, cacheable "nothing", not a 403 that would let an URL probe
 * distinguish a disabled feature from a missing one.
 */
export const socialProofRoute = new Router();

const MAX_CANDIDATES = 200;

socialProofRoute.get(
  "/recent",
  guarded("social.proof", async (c) => {
    const enabled = await getSetting<boolean>("socialProof.enabled");
    if (!enabled) {
      c.res.setHeader("Cache-Control", "public, max-age=60");
      return c.json(ok({ events: [] as ProofEvent[] }));
    }

    const now = Date.now();
    const since = new Date(now - 24 * 60 * 60_000);

    // Paid order lines. `updatedAt` is the closest thing the schema has to a
    // paid-at: `paymentStatus='PAID'` is only written after server-side
    // provider verification, which is the moment this row last changed for
    // the reason the event exists.
    const purchaseRows = await db
      .select({
        productId: orderItems.productId,
        kind: orders.orderType,
        productTitle: products.title,
        productSlug: products.slug,
        location: products.location,
        happenedAt: orders.updatedAt,
        image: sql<string | null>`(
          SELECT pi.url FROM product_images pi
          WHERE pi.product_id = ${products.id} ORDER BY pi.sort_order ASC LIMIT 1
        )`,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(
        and(
          eq(orders.paymentStatus, "PAID"),
          eq(products.status, "PUBLISHED"),
          gte(orders.updatedAt, since),
        ),
      )
      .orderBy(desc(orders.updatedAt))
      .limit(MAX_CANDIDATES);

    // Newly published listings. `createdAt` — not `updatedAt` — so a price
    // edit hours later does not re-advertise an old listing as new.
    const listingRows = await db
      .select({
        productId: products.id,
        productTitle: products.title,
        productSlug: products.slug,
        location: products.location,
        happenedAt: products.createdAt,
        image: sql<string | null>`(
          SELECT pi.url FROM product_images pi
          WHERE pi.product_id = ${products.id} ORDER BY pi.sort_order ASC LIMIT 1
        )`,
      })
      .from(products)
      .where(and(eq(products.status, "PUBLISHED"), gte(products.createdAt, since)))
      .orderBy(desc(products.createdAt))
      .limit(MAX_CANDIDATES);

    const raw: RawProofEvent[] = [
      ...purchaseRows.map(
        (row): RawProofEvent => ({
          kind: row.kind === "RENTAL" ? "rented" : "bought",
          productId: row.productId,
          productTitle: row.productTitle,
          productSlug: row.productSlug,
          image: row.image ?? null,
          location: row.location,
          happenedAt: Number(row.happenedAt),
        }),
      ),
      ...listingRows.map(
        (row): RawProofEvent => ({
          kind: "listed",
          productId: row.productId,
          productTitle: row.productTitle,
          productSlug: row.productSlug,
          image: row.image ?? null,
          location: row.location,
          happenedAt: Number(row.happenedAt),
        }),
      ),
    ];

    const events = buildPublicProofFeed(dedupeEvents(raw), now).slice(0, 10);

    // Validate the shape we are about to publish: a bad row type (a title
    // with `undefined`, a bucket outside the enum) fails the request loudly
    // instead of rendering one.
    const payload = z
      .array(
        z.object({
          kind: z.enum(["rented", "bought", "listed"]),
          productTitle: z.string().min(1).max(200),
          productSlug: z.string().min(1).max(80),
          image: z.string().max(500).nullable(),
          city: z.string().max(60).nullable(),
          bucket: z.enum(["10-30 min", "1 h", "today"]),
        }),
      )
      .parse(events);

    c.res.setHeader("Cache-Control", "public, max-age=60");
    return c.json(ok({ events: payload }));
  }),
);
