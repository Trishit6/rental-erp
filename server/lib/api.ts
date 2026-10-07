import { z } from "zod";
import type { Ctx, Next } from "./http";

export type ApiError = {
  code: string;
  message: string;
};

export type ApiEnvelope<T> =
  { success: true; data: T; pagination?: Pagination } | { success: false; error: ApiError };

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function ok<T>(data: T, pagination?: Pagination) {
  const body: ApiEnvelope<T> = pagination
    ? { success: true, data, pagination }
    : { success: true, data };
  return body;
}

export function fail(code: string, message: string): { success: false; error: ApiError } {
  return { success: false, error: { code, message } };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

export function buildPagination(page: number, pageSize: number, total: number): Pagination {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function errorMiddleware(_c: Ctx, next: Next) {
  await next();
}

/** Central error handler — wired via app.onError so async route throws are always caught. */
export async function onErrorHandler(error: unknown, c: Ctx) {
  if (error instanceof z.ZodError) {
    return c.json(
      fail(
        "VALIDATION_ERROR",
        error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      ),
      400,
    );
  }
  if (error instanceof HttpError) {
    return c.json(fail(error.code, error.message), error.status);
  }
  console.error("[api] unhandled error:", error);
  return c.json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
}

/**
 * Naive in-memory rate limiter (per-IP, per-limiter).
 *
 * ## Why the bucket key carries a limiter id
 *
 * `buckets` was keyed by IP alone, so every limiter in the app shared one counter. The
 * consequence is not "a shared budget" — it is that each route then applied *its own*
 * threshold to that shared count. `/auth/register` allows 5, so the sixth request of any
 * kind — a login, a cart add, an unrelated public read — pushed the counter past 5, and
 * every subsequent registration answered `429` for everyone behind that address. Because
 * `clientKey` falls back to `"unknown"` whenever `x-forwarded-for` is absent, that is the
 * default case rather than an edge case.
 *
 * Each `rateLimit()` call site therefore gets its own id, allocated here rather than passed
 * in: a limit is independent by construction, and adding a limiter cannot accidentally
 * tighten a different one.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
let nextLimiterId = 0;

function clientKey(c: Ctx): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  // Without a proxy header, the socket's own address. The old fallback here was
  // the literal `"unknown"`, which put *every* client that arrived without a
  // proxy — i.e. the default local deployment, and any deployment not behind a
  // load balancer — into one shared bucket: the sixth sign-in from anybody then
  // rate-limited everybody. Falling back to the peer address is what makes the
  // limiter per-IP as its documentation already claimed.
  return c.req.raw.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(limit: number, windowMs: number) {
  const limiterId = `l${nextLimiterId++}`;
  return async (c: Ctx, next: Next) => {
    const key = `${limiterId}:${clientKey(c)}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > limit) {
        return c.json(fail("RATE_LIMITED", "Too many requests. Please slow down."), 429);
      }
    }
    await next();
  };
}
