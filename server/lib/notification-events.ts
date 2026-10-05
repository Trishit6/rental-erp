/**
 * The notification vocabulary.
 *
 * ## What this file is for
 *
 * A notification is only useful if a user can answer three questions about it
 * without guessing: *what kind of thing is this*, *which page answers it*, and
 * *who is it for*. All three are answers about the **type**, so the type is the
 * only thing that needs to be declared once, here, and every other surface reads
 * this list rather than re-deciding:
 *
 *  - the writer (`notify()` in `lib/notifications.ts`) resolves the destination
 *    from `destination` and formats copy from `copy`;
 *  - the preferences API offers only categories that actually have emitters;
 *  - the client renders an icon and a label per type from its own mirrored copy of
 *    this file, so an unrecognised type degrades to a neutral bell instead of a
 *    blank row.
 *
 * ## Why `supported: false` entries exist
 *
 * The brief lists a lot of event types; this application implements some of them
 * and not others. Rather than emitting nothing for the unsupported ones — which
 * would be indistinguishable from a bug when someone reads the list — the ones
 * that are *defined but not yet emitted* are declared with `supported: false`.
 * `isInAppWorthy`/`isEmailWorthy` then refuse to deliver them, so a call site that
 * reaches for `ORDER_OUT_FOR_DELIVERY` writes nothing instead of quietly promising
 * a delivery that no courier system will ever confirm. Everything with
 * `supported: true` has a real emitter; `tests/notification-events.test.ts` asserts
 * that list against the vocabulary so the two cannot drift apart.
 *
 * Nothing in this module touches the database, the session or the environment —
 * it is a lookup table, and it stays that way so the client can mirror it.
 */

/** The preference categories a user can control. */
export const NOTIFICATION_CATEGORIES = [
  "ORDERS",
  "RENTALS",
  "PAYMENTS",
  "SELLER",
  "WISHLIST",
  "ADMIN",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Human labels for the preferences UI. */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  ORDERS: "Orders & purchases",
  RENTALS: "Rentals",
  PAYMENTS: "Payments & refunds",
  SELLER: "Seller activity",
  WISHLIST: "Wishlist",
  ADMIN: "Admin queue",
};

/**
 * Why a category has no email channel.
 *
 * A toggle with nothing behind it is worse than no toggle — it teaches a user
 * that a control works. `WISHLIST` and `ADMIN` are in-app only for that reason:
 * a price-drop email is the classic unwanted-mail complaint, and admin queue
 * events belong in the admin workspace, not in an inbox.
 */
export const CATEGORY_EMAIL_CAPABLE: Record<NotificationCategory, boolean> = {
  ORDERS: true,
  RENTALS: true,
  PAYMENTS: true,
  SELLER: true,
  WISHLIST: false,
  ADMIN: false,
};

/** The kinds of thing a notification can be about. */
export const NOTIFICATION_ENTITY_TYPES = [
  "ACCOUNT",
  "ORDER",
  "RENTAL",
  "PRODUCT",
  "LISTING",
  "CONVERSATION",
  "PAYMENT",
] as const;

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

type Destination =
  | { readonly kind: "static"; readonly to: string }
  /** A public listing page — addressed by slug, because that is its route. */
  | { readonly kind: "product"; readonly slugFrom: "productSlug" }
  /** The public order page — addressed by the customer-facing order number. */
  | { readonly kind: "order"; readonly numberFrom: "orderNumber"; readonly idFrom: "orderId" }
  /** The rental detail page, addressed by numeric id. */
  | { readonly kind: "rental"; readonly idFrom: "rentalId" }
  /** The seller's own listing row. */
  | { readonly kind: "sellerListing"; readonly idFrom: "productId" }
  /** The seller workspace's rentals tab. */
  | { readonly kind: "sellerRentals" }
  /** The seller workspace's orders tab. */
  | { readonly kind: "sellerOrders" }
  /** The seller's reviews tab. */
  | { readonly kind: "sellerReviews" }
  | { readonly kind: "notifications" }
  | { readonly kind: "messages"; readonly conversationFrom: "conversationId" }
  | { readonly kind: "profile" }
  | { readonly kind: "adminOrders" }
  | { readonly kind: "adminProducts" }
  | { readonly kind: "adminModeration" }
  | { readonly kind: "profileActivity" };

/**
 * The data an event can supply, and nothing more.
 *
 * Every field is optional because no single event fills all of them: a payment
 * failure knows a `transactionId`, a shipment knows an `orderNumber`. What this
 * type deliberately cannot express is a URL — `destination` above is built from
 * these ids alone, which is what stops a notification link from ever being
 * attacker-influenced.
 */
export type NotificationEventContext = {
  orderId?: number | null;
  orderNumber?: string | null;
  rentalId?: number | null;
  productId?: number | null;
  productSlug?: string | null;
  conversationId?: number | null;
  transactionId?: number | null;
  /** Used by the order destination's fallback when there is no order number. */
  orderIdFallbackLabel?: string;
};

/** Where clicking this notification should go. */
export type NotificationDestination = string;

export type NotificationTypeDefinition = {
  readonly category: NotificationCategory;
  readonly label: string;
  /**
   * Whether any code path actually emits this type today.
   *
   * `false` means "reserved, not emitted" — see the module comment.
   */
  readonly supported: boolean;
  readonly entity: NotificationEntityType | null;
  readonly destination: Destination | null;
};

function define(
  entries: Record<string, NotificationTypeDefinition>,
): Readonly<Record<string, NotificationTypeDefinition>> {
  return Object.freeze(entries);
}

/**
 * Every notification type the platform knows about.
 *
 * The legacy tokens at the bottom (`ORDER_CONFIRMED`, `NEW_MESSAGE`, `PRICE_DROP`,
 * `RENTAL_ENDING_SOON`, …) predate this module: they were written by `seed.ts` and
 * by three separate call sites that each spelled their own string. They are listed
 * here so the feed can still render an icon and a label for a row that was seeded
 * days ago — an unmapped type falls back to a neutral bell, which is fine, but a
 * *known* one does not have to.
 */
export const NOTIFICATION_TYPES = define({
  /* -------------------------------- account -------------------------------- */

  ACCOUNT_WELCOME: {
    category: "ORDERS",
    label: "Welcome to Revaro",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "profile" },
  },
  LOGIN_NEW_DEVICE: {
    category: "ORDERS",
    label: "New sign-in",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "profile" },
  },
  PROFILE_UPDATED: {
    category: "ORDERS",
    label: "Profile updated",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "profile" },
  },
  // How a user learns that a password change happened and revoked their other
  // sessions. It sits with the other account types rather than in a category of its
  // own: `NotificationCategory` is a *preference* axis the notifications settings form
  // iterates, so introducing one for a single event would add a toggle that controls
  // exactly one notification.
  ACCOUNT_PASSWORD_CHANGED: {
    category: "ORDERS",
    label: "Password changed",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "profile" },
  },

  /* --------------------------------- orders -------------------------------- */

  ORDER_PLACED: {
    category: "ORDERS",
    label: "Order placed",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_NEW: {
    category: "ORDERS",
    label: "New order",
    supported: true,
    entity: "ORDER",
    destination: { kind: "sellerOrders" },
  },
  ORDER_CONFIRMED: {
    category: "ORDERS",
    label: "Order confirmed",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_PROCESSING: {
    category: "ORDERS",
    label: "Order processing",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_SHIPPED: {
    category: "ORDERS",
    label: "Order shipped",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  /** Reserved: no courier integration exists, so nothing can honestly confirm it. */
  ORDER_OUT_FOR_DELIVERY: {
    category: "ORDERS",
    label: "Out for delivery",
    supported: false,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_READY_FOR_PICKUP: {
    category: "ORDERS",
    label: "Ready for pickup",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_DELIVERED: {
    category: "ORDERS",
    label: "Order delivered",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_COMPLETED: {
    category: "ORDERS",
    label: "Order completed",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  ORDER_CANCELLED: {
    category: "ORDERS",
    label: "Order cancelled",
    supported: true,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  /**
   * Seed-only token, kept so old rows still render with a real icon.
   *
   * `supported: false` because nothing emits it — `PAYMENT_SUCCESSFUL` is what the
   * order path actually writes, and this row was created by `seed.ts` before either
   * existed. The label and destination are kept (not deleted) because a row already in
   * somebody's database has to keep rendering with a sensible name and destination;
   * `supported` is about *generating* new ones, not about displaying old ones.
   */
  ORDER_PAID: {
    category: "PAYMENTS",
    label: "Payment received",
    supported: false,
    entity: "ORDER",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },

  /* -------------------------------- rentals -------------------------------- */

  RENTAL_CONFIRMED: {
    category: "RENTALS",
    label: "Rental confirmed",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  RENTAL_STARTING_SOON: {
    category: "RENTALS",
    label: "Rental starting soon",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  RENTAL_ACTIVE: {
    category: "RENTALS",
    label: "Rental started",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  RENTAL_RETURN_DUE: {
    category: "RENTALS",
    label: "Return due soon",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  RENTAL_OVERDUE: {
    category: "RENTALS",
    label: "Rental overdue",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  RENTAL_RETURNED: {
    category: "RENTALS",
    label: "Rental returned",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  /**
   * Owner-facing: the renter asked to bring the item back and the owner has to
   * confirm it before the deposit is released.
   */
  RENTAL_RETURN_REQUESTED: {
    category: "RENTALS",
    label: "Return requested",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "sellerRentals" },
  },
  RENTAL_CANCELLED: {
    category: "RENTALS",
    label: "Rental cancelled",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },
  /** Seed-only alias of `RENTAL_RETURN_DUE`; see `ORDER_PAID` for why `supported: false`. */
  RENTAL_ENDING_SOON: {
    category: "RENTALS",
    label: "Return due soon",
    supported: false,
    entity: "RENTAL",
    destination: { kind: "rental", idFrom: "rentalId" },
  },

  /* ------------------------------- payments -------------------------------- */

  PAYMENT_SUCCESSFUL: {
    category: "PAYMENTS",
    label: "Payment successful",
    supported: true,
    entity: "PAYMENT",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  PAYMENT_FAILED: {
    category: "PAYMENTS",
    label: "Payment failed",
    supported: true,
    entity: "PAYMENT",
    destination: null,
  },
  REFUND_REQUESTED: {
    category: "PAYMENTS",
    label: "Refund requested",
    supported: true,
    entity: "PAYMENT",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },
  REFUND_PROCESSED: {
    category: "PAYMENTS",
    label: "Refund processed",
    supported: true,
    entity: "PAYMENT",
    destination: { kind: "order", numberFrom: "orderNumber", idFrom: "orderId" },
  },

  /* --------------------------------- seller -------------------------------- */

  LISTING_SUBMITTED: {
    category: "SELLER",
    label: "Listing submitted",
    supported: true,
    entity: "LISTING",
    destination: { kind: "sellerListing", idFrom: "productId" },
  },
  LISTING_APPROVED: {
    category: "SELLER",
    label: "Listing approved",
    supported: true,
    entity: "LISTING",
    destination: { kind: "sellerListing", idFrom: "productId" },
  },
  LISTING_REJECTED: {
    category: "SELLER",
    label: "Listing rejected",
    supported: true,
    entity: "LISTING",
    destination: { kind: "sellerListing", idFrom: "productId" },
  },
  PRODUCT_SOLD: {
    category: "SELLER",
    label: "Product sold",
    supported: true,
    entity: "PRODUCT",
    // The seller's own listing row, not the public product page. The recipient is the
    // seller (emitted from the order fan-out in `lib/order-creation.ts`), and the next
    // thing they do with a sold listing is manage its stock — the public page is where
    // a *buyer* would go, which is not who is being told.
    destination: { kind: "sellerListing", idFrom: "productId" },
  },
  RENTAL_BOOKED: {
    category: "SELLER",
    label: "Rental booked",
    supported: true,
    entity: "RENTAL",
    destination: { kind: "sellerRentals" },
  },
  MESSAGE_RECEIVED: {
    category: "SELLER",
    label: "Customer message",
    supported: true,
    entity: "CONVERSATION",
    destination: { kind: "messages", conversationFrom: "conversationId" },
  },
  /** Seed-only alias of `MESSAGE_RECEIVED`; see `ORDER_PAID` for why `supported: false`. */
  NEW_MESSAGE: {
    category: "SELLER",
    label: "New message",
    supported: false,
    entity: "CONVERSATION",
    destination: { kind: "messages", conversationFrom: "conversationId" },
  },
  REVIEW_RECEIVED: {
    category: "SELLER",
    label: "New review received",
    supported: true,
    entity: "LISTING",
    destination: { kind: "sellerReviews" },
  },

  /* -------------------------------- wishlist ------------------------------- */

  WISHLIST_PRICE_CHANGE: {
    category: "WISHLIST",
    label: "Price change",
    supported: true,
    entity: "PRODUCT",
    destination: { kind: "product", slugFrom: "productSlug" },
  },
  /** Seed-only alias of `WISHLIST_PRICE_CHANGE`; see `ORDER_PAID` for why `supported: false`. */
  PRICE_DROP: {
    category: "WISHLIST",
    label: "Price drop",
    supported: false,
    entity: "PRODUCT",
    destination: { kind: "product", slugFrom: "productSlug" },
  },
  WISHLIST_BACK_IN_STOCK: {
    category: "WISHLIST",
    label: "Back in stock",
    supported: true,
    entity: "PRODUCT",
    destination: { kind: "product", slugFrom: "productSlug" },
  },

  /* --------------------------------- admin --------------------------------- */

  ADMIN_NEW_SELLER: {
    category: "ADMIN",
    label: "New seller",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "adminProducts" },
  },
  ADMIN_PRODUCT_PENDING: {
    category: "ADMIN",
    label: "Listing pending approval",
    supported: true,
    entity: "LISTING",
    destination: { kind: "adminProducts" },
  },
  ADMIN_NEW_ORDER: {
    category: "ADMIN",
    label: "New order",
    supported: true,
    entity: "ORDER",
    destination: { kind: "adminOrders" },
  },
  ADMIN_REFUND_REQUEST: {
    category: "ADMIN",
    label: "Refund request",
    supported: true,
    entity: "PAYMENT",
    destination: { kind: "adminOrders" },
  },
  ADMIN_SUSPICIOUS_ACTIVITY: {
    category: "ADMIN",
    label: "Suspicious activity",
    supported: true,
    entity: "ACCOUNT",
    destination: { kind: "adminModeration" },
  },
});

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && value in NOTIFICATION_TYPES;
}

export function notificationTypeDefinition(
  type: string,
): NotificationTypeDefinition | null {
  return isNotificationType(type) ? NOTIFICATION_TYPES[type] : null;
}

/**
 * Which preference category a type belongs to.
 *
 * ## Why an unmapped type answers `ORDERS` rather than throwing
 *
 * An unrecognised `type` is a row seeded before this module existed, not a bug. The
 * category is only consulted to decide whether to *send* to the user, and the safest
 * answer for a token nobody recognises is the most permissive category: an old
 * notification that predates the preferences feature should keep arriving rather
 * than going silent for a user who never opted into anything. `isInAppWorthy` and
 * `isEmailWorthy` separately return `false` for an unmapped type, so the row is
 * displayed but no *new* one of an unknown shape is ever generated.
 */
export function notificationCategoryFor(type: string): NotificationCategory {
  return notificationTypeDefinition(type)?.category ?? "ORDERS";
}

/** Which kind of entity a type is about, if any. */
export function notificationEntityFor(type: string): NotificationEntityType | null {
  return notificationTypeDefinition(type)?.entity ?? null;
}

/**
 * The icon key the client should draw for a type.
 *
 * Returned rather than resolved to a component because this module is deliberately
 * free of React and of `lucide-react`, so the server and the client can share the
 * vocabulary without either depending on the other's runtime. An unmapped type
 * answers `DEFAULT`, which the client draws as a plain bell.
 */
export type NotificationIconKey =
  | "ACCOUNT"
  | "ORDER"
  | "RENTAL"
  | "PAYMENT"
  | "LISTING"
  | "MESSAGE"
  | "WISHLIST"
  | "ADMIN"
  | "DEFAULT";

/**
 * The icon key for a type, derived from its *entity* rather than its category.
 *
 * The distinction matters for a handful of types: a `WELCOME` and a `PRICE_DROP` are
 * both filed under a category, but they are about completely different things, and
 * drawing the category's icon for both would give a welcome banner a shopping-bag
 * glyph. Keying off `entity` — what the notification is *about* — gets each one
 * right, and keeps the two axes (who gets it, what it concerns) independent.
 */
export function notificationIconFor(type: string): NotificationIconKey {
  switch (notificationEntityFor(type)) {
    case "ACCOUNT":
      return "ACCOUNT";
    case "ORDER":
      return "ORDER";
    case "RENTAL":
      return "RENTAL";
    case "PAYMENT":
      return "PAYMENT";
    case "PRODUCT":
      return notificationCategoryFor(type) === "WISHLIST" ? "WISHLIST" : "LISTING";
    case "LISTING":
      return "LISTING";
    case "CONVERSATION":
      return "MESSAGE";
    default:
      return "DEFAULT";
  }
}

/** Every type that some code path actually emits. */
export function supportedNotificationTypes(): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
    (type) => NOTIFICATION_TYPES[type].supported,
  );
}

/** The types belonging to one category — what a preferences screen groups under. */
export function notificationTypesForCategory(category: NotificationCategory): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
    (type) => NOTIFICATION_TYPES[type].category === category,
  );
}

/**
 * Whether a type should be delivered by email at all.
 *
 * `false` for an unmapped or unsupported type on purpose: an unknown row must not
 * be able to pull mail out of the system, and a category with no email channel
 * (`WISHLIST`, `ADMIN`) must not either.
 */
export function isEmailWorthy(type: string): boolean {
  const definition = notificationTypeDefinition(type);
  if (!definition || !definition.supported) return false;
  return CATEGORY_EMAIL_CAPABLE[definition.category];
}

/** Whether a type belongs in the in-app feed at all. */
export function isInAppWorthy(type: string): boolean {
  return notificationTypeDefinition(type)?.supported ?? false;
}

/**
 * Resolve the client route a notification should open.
 *
 * Returns `null` when the destination cannot be built from the context — a rental
 * notification whose `rentalId` is missing, say. That is the honest answer: a link
 * to a page that cannot render the thing is worse than no link, and the feed
 * renders a non-clickable row instead of a broken navigation.
 *
 * The order destination prefers the customer-facing `orderNumber` (`/orders/RV-…`)
 * and falls back to the numeric id, because `/orders/:orderId` accepts both and the
 * number is what the user was shown in the notification text.
 */
export function notificationDestination(
  type: string,
  context: NotificationEventContext = {},
): NotificationDestination | null {
  const definition = notificationTypeDefinition(type);
  if (!definition || !definition.destination) return null;

  switch (definition.destination.kind) {
    case "static":
      return definition.destination.to;
    case "product": {
      const slug = context.productSlug;
      return slug ? `/product/${encodeURIComponent(slug)}` : null;
    }
    case "order": {
      const number = context.orderNumber;
      if (number) return `/orders/${encodeURIComponent(number)}`;
      const id = context.orderId;
      return id && id > 0 ? `/orders/${id}` : null;
    }
    case "rental": {
      const id = context.rentalId;
      return id && id > 0 ? `/rentals/${id}` : null;
    }
    case "sellerListing": {
      const id = context.productId;
      return id && id > 0 ? `/dashboard/products/${id}` : null;
    }
    case "sellerRentals":
      return "/dashboard/rentals";
    case "sellerOrders":
      return "/dashboard/orders";
    case "sellerReviews":
      return "/dashboard/reviews";
    case "notifications":
      return "/notifications";
    case "messages": {
      const id = context.conversationId;
      // No conversation id means the thread has not been opened yet, so the message
      // centre itself is the right answer — not a link to a conversation that
      // does not exist.
      return id && id > 0 ? `/messages?conversation=${id}` : "/messages";
    }
    case "profile":
      return "/profile";
    case "adminOrders":
      return "/admin/orders";
    case "adminProducts":
      return "/admin/products";
    case "adminModeration":
      return "/admin/moderation";
    case "profileActivity":
      return "/profile/activity";
  }
}

/**
 * A deterministic idempotency key for "tell this user about this occurrence".
 *
 * ## Why the shape is `<TYPE>:<entity>:<discriminator>`
 *
 * The three parts are not arbitrary:
 *
 *  - `TYPE` — so a customer gets one "shipped" notice per order rather than one
 *    per retry of the request that shipped it.
 *  - the entity id — so two different orders in the same minute are two
 *    notifications, not one that swallows the other.
 *  - a *discriminator* for events that legitimately repeat — a return reminder is
 *    genuinely one-per-day-per-rental, so the key carries the date and the daily
 *    reminder can fire tomorrow without colliding with today's.
 *
 * The recipient is **not** part of the key: `notifications.event_key` is globally
 * unique, so the same key cannot be written twice, which means a key shared between
 * two participants would let the *first* one notified suppress the second. Callers
 * therefore pass the other participant's id as the discriminator when both sides
 * must hear about one event — see the `ORDER_CANCELLED` fan-out in
 * `server/lib/order-creation.ts`.
 */
export function notificationEventKey(
  type: string,
  entityId: number | null | undefined,
  discriminator?: string | number,
): string {
  const scope = entityId === null || entityId === undefined ? "none" : String(entityId);
  const tail = discriminator === undefined || discriminator === "" ? "" : `:${discriminator}`;
  return `${type}:${scope}${tail}`.slice(0, 190);
}

/** Row-length guards matching the column widths in `server/schema.ts`. */
export const TITLE_MAX = 120;
export const BODY_MAX = 300;
export const LINK_MAX = 200;

export function truncateTitle(value: string): string {
  return value.slice(0, TITLE_MAX);
}

export function truncateBody(value: string): string {
  return value.slice(0, BODY_MAX);
}

export function truncateLink(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, LINK_MAX);
}

/**
 * Whether a resolved link is safe to hand the client as a route target.
 *
 * The header pushes `navigate({ to: link })`, so a link must be an **internal
 * absolute path**. Anything else — a protocol, a scheme-relative URL, a path with a
 * `javascript:` payload smuggled through a redirect — is refused. `link` is written
 * only by `notify()` from `notificationDestination()`, but this check exists because
 * the column is plain text and seeded rows predate that guarantee.
 */
export function isInternalRoute(link: string | null | undefined): link is string {
  if (!link) return false;
  if (!link.startsWith("/")) return false;
  if (link.startsWith("//")) return false;
  if (link.includes("\\")) return false;
  // `/\example.com` and `/\evil.com` are treated as protocol-relative by some
  // browsers, so a backslash is refused outright above.
  return !/[\s<>"]/.test(link);
}