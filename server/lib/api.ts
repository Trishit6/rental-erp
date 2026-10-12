import { z } from "zod";
import type { Ctx, Next } from "./http";
import { logger } from "./logger";

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

/**
 * Central error handler — wired via app.onError so async route throws are always caught.
 */
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
  const requestId = c.res.getHeader("X-Request-Id") ?? "";
  logger.error("Unhandled error", {
    requestId,
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
  });
  return c.json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
}
