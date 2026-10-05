import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarCheck,
  History,
  PackageCheck,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { useActivity, prefetchActivity } from "./query";
import type { ActivityFilters, ActivityItem, ActivityKind } from "./types";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS } from "./types";

/**
 * `/profile/activity` — the signed-in user's own history as a timeline.
 *
 * ## Why this is derived rather than recorded
 *
 * The obvious design is an `activity_events` table written by every feature that does
 * something. It is also a second source of truth for facts that already exist: an order
 * table already knows when an order was placed and delivered, and a row in a second
 * table saying so can disagree with it — after a backfill, a status correction, or any
 * path that forgets to write the event. `server/lib/activity.ts` reads the real rows
 * instead, so the timeline cannot drift from the pages it summarises.
 *
 * The cost is that only kinds backed by a real table can appear, and the page says so:
 * the filter chips are the kinds this person actually has history of, not the whole
 * vocabulary.
 */
export function ActivityPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const filters = parseActivityFilters(search);
  const { data, isLoading, isError, refetch } = useActivity(filters, true);

  const items = data?.items ?? [];
  const chips = data?.availableKinds ?? [];
  const page = data?.page ?? filters.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  function update(next: Partial<ActivityFilters>) {
    void navigate({
      to: "/profile/activity",
      search: toActivityUrlSearch({ ...filters, ...next }),
      replace: true,
    });
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6 pb-12 pt-8">
      <header>
        <h1 className="section-title text-3xl">Your activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you have done on Revaro — orders, rentals, reviews and your listings.
        </p>
      </header>

      {chips.length > 1 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            aria-pressed={!filters.kind}
            onClick={() => update({ kind: null, page: 1 })}
            className={chip(!filters.kind)}
          >
            Everything
          </button>
          {chips.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filters.kind === kind}
              onClick={() => update({ kind: filters.kind === kind ? null : kind, page: 1 })}
              className={chip(filters.kind === kind)}
            >
              {ACTIVITY_KIND_LABELS[kind]}
            </button>
          ))}
        </Card>
      )}

      {isLoading ? (
        <TimelineSkeleton />
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold">Couldn&apos;t load your activity</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check your connection and try again.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title={filters.kind ? "Nothing in this category yet" : "No activity yet"}
          description={
            filters.kind
              ? "Try another filter, or clear it to see everything."
              : "Once you buy, rent, sell or review something, it shows up here."
          }
          action={
            filters.kind ? (
              <Button variant="secondary" size="sm" onClick={() => update({ kind: null, page: 1 })}>
                Clear filter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ol className="relative space-y-3 pl-6">
            {/* The rail. One continuous line behind the markers, so a long history reads
                as one timeline rather than a stack of unrelated cards. */}
            <span
              className="absolute bottom-4 left-[11px] top-4 w-px bg-border"
              aria-hidden
            />
            {items.map((item) => (
              <TimelineRow key={item.id} item={item} />
            ))}
          </ol>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={(next) => update({ page: next })}
            onPrefetch={(next) => prefetchActivity(queryClient, { ...filters, page: next })}
          />
        </>
      )}
    </div>
  );
}

/** One entry: a marker on the rail, and the fact it describes. */
function TimelineRow({ item }: { item: ActivityItem }) {
  const Icon = ACTIVITY_ICONS[item.kind];

  const body = (
    <Card
      className={`p-4 transition ${item.link ? "hover:border-primary/40 hover:bg-primary/5" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="soft-button flex size-9 shrink-0 items-center justify-center rounded-xl text-primary">
          <Icon size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">{item.title}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}
          <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
            {new Date(item.at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
    </Card>
  );

  return (
    <li className="relative">
      {/* The marker sits on the rail, outside the card, so the card itself is free to be
          a link without dragging the decoration into the hit area. */}
      <span
        className="soft-button absolute -left-6 top-4 flex size-6 items-center justify-center rounded-full text-primary ring-4 ring-background"
        aria-hidden
      >
        <Icon size={13} />
      </span>
      {item.link ? <Link to={item.link}>{body}</Link> : body}
    </li>
  );
}

/**
 * One icon per kind.
 *
 * A glyph per kind rather than one per category, because the kinds a person actually
 * accumulates — a rental started, a rental returned, an item sold — are exactly the
 * ones where the difference matters. A timeline of identical bag icons tells a user
 * nothing about where their rental is in its life.
 *
 * A module-scope record rather than an `iconFor(kind)` function: the function is the same
 * at runtime, but assigning its result to a capitalized variable in render reads to the
 * React compiler lint rule as a component created during render. Every other icon map in
 * this codebase is shaped like this one.
 */
const ACTIVITY_ICONS: Record<ActivityKind, ComponentType<LucideProps>> = {
  ACCOUNT_CREATED: Sparkles,
  ORDER_PLACED: ShoppingBag,
  ORDER_DELIVERED: Truck,
  RENTAL_BOOKED: CalendarCheck,
  RENTAL_STARTED: Repeat2,
  RENTAL_RETURNED: PackageCheck,
  REVIEW_SUBMITTED: Award,
  LISTING_CREATED: Store,
  PRODUCT_SOLD: PackageCheck,
};

/** The rail's entry state while the timeline loads. */
function TimelineSkeleton() {
  return (
    <ol className="relative space-y-3 pl-6" aria-hidden>
      <span className="absolute bottom-4 left-[11px] top-4 w-px bg-border" />
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="relative">
          <span className="soft-button absolute -left-6 top-4 size-6 animate-pulse rounded-full" />
          <Card className="flex items-start gap-3 p-4">
            <div className="size-9 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-muted" />
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/** One filter chip's classes, kept out of the JSX so the row stays about behaviour. */
function chip(active: boolean): string {
  return [
    "rounded-full px-3 py-1.5 text-xs font-bold transition",
    active
      ? "primary-button text-primary-foreground"
      : "soft-button text-muted-foreground hover:text-primary",
  ].join(" ");
}

/* --------------------------------- filters --------------------------------- */

/** Page size for the timeline. The server caps at 50 and defaults to 20. */
export const ACTIVITY_PAGE_SIZE = 20;

const KINDS = ACTIVITY_KINDS as readonly string[];

/**
 * Parse untrusted URL search params into canonical filters.
 *
 * `Number` rather than `z.coerce` here because this module has no other schema to share
 * and the shape is two fields; the guard is the same either way — a hand-edited
 * `?page=-3` or `?kind=anything` degrades to "page 1, no filter" instead of erroring the
 * page or, worse, being forwarded to the server as a value it would have to reject.
 */
export function parseActivityFilters(input: Record<string, unknown>): ActivityFilters {
  const page = Number(input.page);
  const kind = typeof input.kind === "string" ? input.kind : "";
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: ACTIVITY_PAGE_SIZE,
    kind: KINDS.includes(kind) ? (kind as ActivityKind) : null,
  };
}

/** Filters as clean URL params — page 1 and "no filter" are the defaults, so dropped. */
export function toActivityUrlSearch(filters: ActivityFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (filters.kind) out.kind = filters.kind;
  if (filters.page && filters.page > 1) out.page = filters.page;
  return out;
}