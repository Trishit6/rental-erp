import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { idempotencyKeys } from "../schema";
import { HttpError } from "./api";

/**
 * The general idempotency table, wired up.
 *
 * `idempotency_keys` existed as a schema with no runtime — money writes each
 * carried their own unique column instead. This module is the missing half: a
 * claim-then-complete pair any mutating handler can wrap itself in so that a
 * double-clicked button, a retried request or a re-sent webhook returns the
 * original answer instead of doing the work twice.
 *
 * The shape is two writes on purpose. The **claim** inserts a bare row (no
 * response yet) and is what makes two concurrent requests serialise: the second
 * loses the unique index and reads back either the finished response or a
 * still-in-flight claim. The **completion** fills in the status and body once the
 * handler has answered. A claim that is never completed is a request that died
 * mid-flight — it is represented honestly as `IN_FLIGHT` rather than replayed as
 * a success that never happened.
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** SHA-256 of the normalised request, mirroring `idempotency_keys.request_hash`. */
export function hashRequest(value: unknown): string {
  const canonical = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(canonical ?? "").digest("hex");
}

export type IdempotencyExecutor = Pick<typeof db, "insert" | "select" | "update">;

export type IdempotencyClaim =
  | { state: "CLAIMED"; id: number }
  /** A previous request already finished; replay its stored response. */
  | { state: "REPLAY"; statusCode: number | null; responseBody: string | null }
  /** A previous request is still running, or a different body reused the key. */
  | { state: "CONFLICT"; reason: string };

function isDuplicateKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Duplicate") || message.includes("duplicate") || message.includes("1062");
}

/**
 * Record intent to run, or discover a previous run for the same key.
 *
 * `requestHash` is compared on a hit: the same key with a *different* body is a
 * client bug (or a deliberate reuse), and replaying the old answer for a
 * different request would be worse than refusing.
 */
export async function claimIdempotencyKey(
  executor: IdempotencyExecutor,
  input: {
    scope: string;
    key: string;
    userId?: number | null;
    requestHash: string;
    ttlMs?: number;
  },
): Promise<IdempotencyClaim> {
  const ttl = input.ttlMs ?? IDEMPOTENCY_TTL_MS;
  try {
    const [inserted] = await executor
      .insert(idempotencyKeys)
      .values({
        scope: input.scope.slice(0, 40),
        key: input.key.slice(0, 120),
        userId: input.userId ?? null,
        requestHash: input.requestHash,
        expiresAt: new Date(Date.now() + ttl),
      })
      .$returningId();
    return { state: "CLAIMED", id: Number(inserted.id) };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const [existing] = await executor
    .select({
      id: idempotencyKeys.id,
      requestHash: idempotencyKeys.requestHash,
      statusCode: idempotencyKeys.statusCode,
      responseBody: idempotencyKeys.responseBody,
    })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, input.scope.slice(0, 40)),
        eq(idempotencyKeys.key, input.key.slice(0, 120)),
      ),
    )
    .limit(1);

  if (!existing) {
    // Lost the insert race, then could not read the winner: treat as in-flight.
    return { state: "CONFLICT", reason: "This request is already in progress." };
  }
  if (existing.requestHash !== input.requestHash) {
    return {
      state: "CONFLICT",
      reason: "This idempotency key was already used for a different request.",
    };
  }
  if (existing.responseBody === null) {
    return { state: "CONFLICT", reason: "This request is already in progress." };
  }
  return {
    state: "REPLAY",
    statusCode: existing.statusCode,
    responseBody: existing.responseBody,
  };
}

/** Store the original response so a retry can be answered without redoing it. */
export async function completeIdempotencyKey(
  executor: IdempotencyExecutor,
  id: number,
  response: { statusCode: number; body: unknown },
): Promise<void> {
  await executor
    .update(idempotencyKeys)
    .set({
      statusCode: response.statusCode,
      responseBody: JSON.stringify(response.body ?? null),
      updatedAt: new Date(),
    })
    .where(eq(idempotencyKeys.id, id));
}

/** Read a client-supplied key from a body, or `null` when none was sent. */
export function readIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 8 ? trimmed.slice(0, 120) : null;
}

/** The one refusal a caller turns a `CONFLICT` claim into. */
export function idempotencyConflict(reason: string): HttpError {
  return new HttpError(409, "IDEMPOTENCY_CONFLICT", reason);
}
