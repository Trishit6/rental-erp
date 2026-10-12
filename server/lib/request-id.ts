/**
 * The request id.
 *
 * Every response carries `X-Request-Id`, and every log line for that request carries
 * the same id. That is the whole feature, and it is what turns "something went wrong"
 * into "this response, correlated with the one line that explains it" — a support
 * question becomes a search instead of a reproduction.
 *
 * An inbound `X-Request-Id` is *adopted* when it is well-formed so a proxy or a test
 * can correlate across services, and ignored otherwise: accepting an arbitrary value
 * verbatim would let a client write unsanitised text into every log line it triggers
 * (log injection), and forging an id lets an attacker correlate their own traffic but
 * learn nothing about anyone else's. The shape check keeps it to an opaque token.
 */

import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

export const REQUEST_ID_HEADER = "X-Request-Id";

/** 8–128 chars of the alphabet an opaque tracing id is built from. */
const ADOPTABLE = /^[A-Za-z0-9._~:-]{8,128}$/;

type RequestWithId = Request & { requestId?: string };

/** The id for this request, set by the middleware; `""` if it never ran. */
export function requestIdOf(req: Request): string {
  return (req as RequestWithId).requestId ?? "";
}

export const requestId: RequestHandler = (req: Request, res: Response, next) => {
  const inbound = req.get(REQUEST_ID_HEADER)?.trim();
  const id = inbound && ADOPTABLE.test(inbound) ? inbound : randomUUID();
  (req as RequestWithId).requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
