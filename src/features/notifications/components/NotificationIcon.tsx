import {
  Bell,
  CreditCard,
  Heart,
  MessageCircle,
  Repeat2,
  ShieldCheck,
  ShoppingBag,
  Star,
  User as UserIcon,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { NotificationIconKey } from "../types";

/**
 * The icon vocabulary, as components.
 *
 * The server sends a *key* rather than a component or a name — `notificationIconFor`
 * returns one of nine strings, so `server/lib/notification-events.ts` stays free of
 * React and of `lucide-react` and can be mirrored by the client without either side
 * depending on the other's runtime.
 *
 * Each key gets its own glyph here because each answers a different question:
 * `WISHLIST` is about an item the user saved and `LISTING` is about a listing they
 * sell, and drawing the same bag for both is how a badge loses its meaning. `Heart`
 * is therefore the wishlist's and `Star` the listing's, which is also the distinction
 * the user drew in their head when they saved something.
 *
 * `DEFAULT` is a real answer rather than an absence: a `type` this build does not
 * recognise — a row seeded before the vocabulary existed — still renders as a plain
 * bell, which is honest, rather than leaving a hole in the feed.
 */
export const NOTIFICATION_ICONS: Record<NotificationIconKey, ComponentType<LucideProps>> = {
  ACCOUNT: UserIcon,
  ORDER: ShoppingBag,
  RENTAL: Repeat2,
  PAYMENT: CreditCard,
  LISTING: Star,
  MESSAGE: MessageCircle,
  WISHLIST: Heart,
  ADMIN: ShieldCheck,
  DEFAULT: Bell,
};

/**
 * A key this build does not recognise still renders as a plain bell.
 *
 * Callers read the map directly — `NOTIFICATION_ICONS[icon] ?? DEFAULT_NOTIFICATION_ICON`.
 * A `notificationIcon(icon)` wrapper would be the same at runtime, but a function that
 * *returns* a component and is called during render looks to the React compiler lint rule
 * like a component created in render: it cannot see that the function returns one of nine
 * fixed imports, and it is right to be suspicious in general. A record read is the shape
 * every other icon map in this codebase uses, and it states the fixed identity without a
 * detour the linter has to reason about.
 *
 * The `??` is not redundant despite what the type says. `icon` arrives over the wire as a
 * plain string, so the runtime has to be as forgiving as the type system is strict.
 */
export const DEFAULT_NOTIFICATION_ICON = Bell;