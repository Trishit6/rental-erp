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

/** Naive in-memory rate limiter (per-IP, per-bucket). */
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(c: Ctx): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

export function rateLimit(limit: number, windowMs: number) {
  return async (c: Ctx, next: Next) => {
    const key = clientKey(c);
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
