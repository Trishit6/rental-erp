import { z } from "zod";
import { Router } from "../lib/http";
import { HttpError, ok, paginationQuerySchema } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requireUser } from "../lib/auth";
import {
  appendTicketMessage,
  createTicket,
  createTicketSchema,
  findOpenTicketForOrder,
  getCustomerTicket,
  listTickets,
  rateTicket,
  reopenTicket,
  suggestHelpTopics,
  ticketMessageSchema,
  ticketRatingSchema,
  TICKET_STATUSES,
  type TicketStatus,
} from "../lib/support";

/**
 * `GET|POST /api/support/...` — the customer's side of support (PROMPT 19).
 *
 * Paths are written relative to the mount in `server/index.ts`. The session gate runs
 * for `*`, before routing, so an anonymous call to any path — including one that does
 * not exist — answers `401` rather than `404`, which is what stops the surface from
 * being a directory of which ticket ids exist.
 *
 * There is no endpoint here that takes a `userId`: the caller is read from the session
 * and passed into a scoped query, and a ticket id that is not the caller's is a `404`
 * rather than a `403`, so guessing an id reveals nothing.
 *
 * Staff live under `/api/admin/support`, behind the admin role gate — a different file
 * for a different authorization model.
 */
export const supportRoute = new Router();

supportRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

const orderIdQuery = z.object({ orderId: z.coerce.number().int().positive() });

function parseStatus(value: unknown): TicketStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !(TICKET_STATUSES as readonly string[]).includes(value)) {
    throw new HttpError(400, "BAD_REQUEST", "Unknown ticket status.");
  }
  return value as TicketStatus;
}

/* ------------------------------- help topics ------------------------------- */

supportRoute.get("/help-topics", (c) => {
  const query = c.req.query("q") ?? "";
  return c.json(ok(suggestHelpTopics(query)));
});

/* --------------------------------- tickets --------------------------------- */

supportRoute.get("/tickets", async (c) => {
  const user = requireUser(c);
  const { page, pageSize } = paginationQuerySchema.parse(c.req.query());
  const status = parseStatus(c.req.query("status"));
  const { rows, pagination } = await listTickets(user.id, { page, pageSize, status });
  return c.json(ok(rows, pagination));
});

supportRoute.post(
  "/tickets",
  guarded("support.create", async (c) => {
    const user = requireUser(c);
    const input = createTicketSchema.parse(await c.req.json());
    const result = await createTicket(user.id, input);
    return c.json(ok(result), 201);
  }),
);

/**
 * Declared before `/tickets/:id` on purpose: the parameterised route would otherwise
 * capture the literal `duplicate` and try to read it as an id.
 */
supportRoute.get("/tickets/duplicate", async (c) => {
  const user = requireUser(c);
  const { orderId } = orderIdQuery.parse(c.req.query());
  const existing = await findOpenTicketForOrder(user.id, orderId);
  return c.json(ok({ ticket: existing }));
});

supportRoute.get("/tickets/:id", async (c) => {
  const user = requireUser(c);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");
  }
  return c.json(ok(await getCustomerTicket(user.id, id)));
});

supportRoute.post(
  "/tickets/:id/messages",
  guarded("support.reply", async (c) => {
    const user = requireUser(c);
    const id = Number(c.req.param("id"));
    const input = ticketMessageSchema.parse(await c.req.json());
    const result = await appendTicketMessage(user.id, id, input);
    return c.json(ok(result), 201);
  }),
);

supportRoute.post(
  "/tickets/:id/reopen",
  guarded("support.reply", async (c) => {
    const user = requireUser(c);
    const id = Number(c.req.param("id"));
    return c.json(ok(await reopenTicket(user.id, id)));
  }),
);

supportRoute.post(
  "/tickets/:id/rating",
  guarded("support.reply", async (c) => {
    const user = requireUser(c);
    const id = Number(c.req.param("id"));
    const input = ticketRatingSchema.parse(await c.req.json());
    return c.json(ok(await rateTicket(user.id, id, input)));
  }),
);
