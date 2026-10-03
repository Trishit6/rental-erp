import { z } from "zod";
import {
  ANALYTICS_PERIODS,
  TOP_PRODUCT_METRICS,
  type AnalyticsParams,
  type AnalyticsPeriod,
  type TopProductMetric,
} from "../types";

/**
 * The analytics page's URL state, as TanStack Router sees it.
 *
 * Every field is optional for the same reason the listings page's are: a
 * `validateSearch` return type with required fields makes the router demand
 * `search` on that route *and its children*, so every link to a child would have
 * to carry an object of defaults it does not mean. A URL's parameters are
 * genuinely optional; `AnalyticsParams` is the total shape the page works with,
 * and `resolveAnalyticsParams` is the only bridge.
 */
export type AnalyticsSearch = {
  period?: string;
  from?: string;
  to?: string;
  metric?: string;
};

/**
 * ## Why the window is in the URL at all
 *
 * An analytics view is the one dashboard page a seller genuinely shares — with a
 * co-owner deciding whether to take a listing down, or with themselves in six
 * weeks when they ask whether that change worked. "Last 30 days" is not a
 * description of a dataset, it is a *decision* about a window, and it is only
 * reproducible if it travels with the link.
 *
 * It is deliberately **not** reproduced from the link alone, which is the
 * subtlety: the server resolves `?period=30d` against the **request**, so a link
 * opened next month reads next month. That is the intended behaviour — the words
 * "last 30 days" have to keep meaning the last thirty days — and it is what the
 * custom range exists for anyone who needs fixed dates.
 */
export const analyticsSearchSchema = z.object({
  period: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  metric: z.string().trim().optional().catch(undefined),
});

/** `YYYY-MM-DD`, the only shape a `<input type="date">` produces. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Used as the route's `validateSearch`. */
export function parseAnalyticsSearch(search: Record<string, unknown>): AnalyticsSearch {
  const parsed = analyticsSearchSchema.parse(search ?? {});
  return {
    ...(parsed.period !== undefined && isAnalyticsPeriod(parsed.period)
      ? { period: parsed.period }
      : {}),
    ...(parsed.from !== undefined && ISO_DATE.test(parsed.from) ? { from: parsed.from } : {}),
    ...(parsed.to !== undefined && ISO_DATE.test(parsed.to) ? { to: parsed.to } : {}),
    ...(parsed.metric !== undefined && isTopProductMetric(parsed.metric)
      ? { metric: parsed.metric }
      : {}),
  };
}

/** URL state → the total parameters the page and the request use. */
export function resolveAnalyticsParams(search: AnalyticsSearch): AnalyticsParams {
  const period = (search.period as AnalyticsPeriod | undefined) ?? "30d";
  const from = search.from;
  const to = search.to;

  // A custom window needs both ends, and they have to be in order. A range the
  // date inputs cannot produce falls back to 30 days rather than being sent for
  // the server to reject: an analytics page showing an empty window reads as "you
  // sold nothing", which is a much worse answer than "that range was nonsense".
  const usable = period === "custom" && from !== undefined && to !== undefined && from <= to;

  return {
    period: usable ? "custom" : period === "custom" ? "30d" : period,
    metric: (search.metric as TopProductMetric | undefined) ?? "revenue",
    from: usable ? from : undefined,
    to: usable ? to : undefined,
  };
}

/** The parameters → the URL. Defaults are omitted, so links stay short. */
export function toAnalyticsSearch(params: AnalyticsParams): AnalyticsSearch {
  const search: AnalyticsSearch = {};
  if (params.period !== "30d") search.period = params.period;
  if (params.period === "custom" && params.from && params.to) {
    search.from = params.from;
    search.to = params.to;
  }
  if (params.metric !== "revenue") search.metric = params.metric;
  return search;
}

/** Has the seller finished typing both custom dates? Drives the Apply button. */
export function canApplyCustomRange(from: string, to: string): boolean {
  return ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to;
}

function isAnalyticsPeriod(value: string): value is AnalyticsPeriod {
  return (ANALYTICS_PERIODS as readonly string[]).includes(value);
}

function isTopProductMetric(value: string): value is TopProductMetric {
  return (TOP_PRODUCT_METRICS as readonly string[]).includes(value);
}
