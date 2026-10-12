/**
 * Request-scoped context exposed to the logger and other diagnostics.
 */

import type { Request } from "express";
import { requestIdOf } from "./request-id";

export function requestContext(req: Request) {
  return {
    requestId: requestIdOf(req),
    method: req.method,
    url: req.originalUrl ?? req.url,
    ip: req.socket?.remoteAddress ?? "unknown",
  };
}
