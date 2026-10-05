/**
 * Notification types.
 *
 * These mirror the *server's* vocabulary (`server/lib/notification-events.ts`), but
 * the client never re-derives it: `GET /api/notifications` resolves the category,
 * the human label and the icon key **on the server** and sends them on each row.
 *
 * That direction is deliberate. The alternative — shipping the token and having the
 * browser hold its own copy of a forty-entry table — is how a client and a server end
 * up disagreeing about what an `ORDER_SHIPPED` row should look like, with nothing to
 * catch it. So `NotificationItem` carries the resolved triple, and this file only
 * declares the *shape* of what arrives plus the narrow unions that make the client's
 * own comparisons type-safe.
 */

/**
 * The preference categories. Mirrors `NOTIFICATION_CATEGORIES` on the server, which is
 * the authority; this union exists so a typo in a filter chip is a compile error.
 */
export type NotificationCategory = "ORDERS" | "RENTALS" | "PAYMENTS" | "SELLER" | "WISHLIST" | "ADMIN";

/**
 * The keys the preferences payload is keyed by.
 *
 * Mirrors `NotificationPreferencesPayload` on the server: camelCase field names,
 * because this is the JSON a settings form round-trips. Distinct from
 * `NotificationCategory`, which is the token stored in a notification's `category`
 * column and used by the feed's filter chips. `PREFERENCE_KEYS` joins the two.
 */
export type PreferenceKey =
  | "orders"
  | "rentals"
  | "payments"
  | "seller"
  | "wishlist"
  | "admin";

/**
 * The icon vocabulary, resolved server-side.
 *
 * Kept as a narrow union rather than `string` so that a server that adds a key it
 * forgets to mirror here is visible at the point of use — the switch in
 * `NotificationIcon` has an exhaustive check that fails typecheck rather than
 * rendering a blank circle.
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

/** What a notification is *about*, for grouping and for the deep link. */
export type NotificationEntityType =
  | "ACCOUNT"
  | "ORDER"
  | "RENTAL"
  | "PRODUCT"
  | "LISTING"
  | "CONVERSATION"
  | "PAYMENT";

/** One notification as `GET /api/notifications` returns it. */
export type NotificationItem = {
  id: number;
  /**
   * The raw event token, e.g. `ORDER_SHIPPED`.
   *
   * Typed as `string`, not as a union of known tokens, on purpose: rows seeded before
   * the vocabulary existed hold tokens this build has never heard of, and refusing to
   * type them would make the feed unable to render its own database. The `label`,
   * `icon` and `category` beside it are resolved server-side precisely so that an
   * unknown token still renders correctly.
   */
  type: string;
  title: string;
  body: string | null;
  /**
   * A resolved **internal** route, or `null`.
   *
   * Guaranteed server-side to start with `/` and to carry no scheme, no `//` and no
   * backslash (`isInternalRoute`), so it can be handed straight to
   * `navigate({ to: link })`. `null` means the type has no destination, or the entity
   * it pointed at is gone; the row renders without a click target rather than
   * navigating somewhere that would 404.
   */
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  relatedEntityType: NotificationEntityType | null;
  relatedEntityId: number | null;
  /** Server-resolved. Drives the filter chips. */
  category: NotificationCategory;
  /** Server-resolved human name for the type. */
  label: string;
  /** Server-resolved icon key. */
  icon: NotificationIconKey;
};

/** Filters for one page of the feed. Every field is optional. */
export type NotificationFilters = {
  page?: number;
  pageSize?: number;
  /** `"true"` on the wire; a boolean here. */
  unreadOnly?: boolean;
  category?: NotificationCategory | null;
};

/** One page of the feed, plus the two counts the page and the badge need. */
export type NotificationPage = {
  items: NotificationItem[];
  total: number;
  /**
   * The unread count over the user's **whole** table, not over this page.
   *
   * Kept separate from the page precisely so the badge is never derived from what
   * happens to be on screen: a user with 60 unread notifications who is looking at
   * page 4 has 60 unread, and the server says so.
   */
  totalUnread: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** The response shape of the write endpoints that also report the new count. */
export type NotificationMutationResult = {
  id?: number;
  isRead?: boolean;
  unread?: number;
  updated?: number;
  deleted?: boolean;
  read?: boolean;
};

/** One channel's switches. `email` is absent where the category has no email. */
export type NotificationChannel = {
  inApp: boolean;
  email?: boolean;
};

/**
 * The signed-in user's effective preferences, as the settings form sees them.
 *
 * Declared twice on purpose. The named fields are what the server actually sends, with
 * the *absence* of `email` on `wishlist`/`admin` being the point — that absence is the
 * type-level expression of "there is no email switch for this category", and it is what
 * `handleSave` reads when it narrows those two on the way out.
 *
 * The `& Readonly<Record<PreferenceKey, NotificationChannel>>` arm is what lets the
 * settings form iterate. A form driven by `PREFERENCE_GROUPS` cannot name its fields, so
 * without it `current[group.key]` is an error; with it, every key is readable as a
 * `NotificationChannel` and `email` is correctly *optional* on the two categories that
 * do not have one. The intersection is the honest way to say "these six exact shapes,
 * also indexable by key, and the keys without an email switch don't have one".
 */
export type NotificationPreferences = {
  orders: { inApp: boolean; email: boolean };
  rentals: { inApp: boolean; email: boolean };
  payments: { inApp: boolean; email: boolean };
  seller: { inApp: boolean; email: boolean };
  wishlist: { inApp: boolean };
  admin: { inApp: boolean };
} & Readonly<Record<PreferenceKey, NotificationChannel>>;

/**
 * The categories whose `email` switch exists.
 *
 * `WISHLIST` and `ADMIN` are absent, and the server's `PATCH /preferences` refuses an
 * `email` key for them outright. A toggle with nothing behind it teaches a user that
 * a control works, so this list and the schema are two halves of one decision.
 */
export const EMAIL_CAPABLE_CATEGORIES = ["ORDERS", "RENTALS", "PAYMENTS", "SELLER"] as const;