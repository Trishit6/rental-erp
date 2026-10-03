import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Router } from "../../server/lib/http";

/**
 * A real HTTP server for a `Router`, so tests exercise the actual matcher.
 *
 * ## Why not assert on a list of strings
 *
 * Both route-table suites in this folder exist to catch *matching* bugs, not
 * typos: an unconstrained `/:id` registered above `GET /mine` answers the literal
 * collection path with a 404 while every handler, schema and client test passes.
 * That failure is a property of registration order and path syntax, so it can only
 * be caught by sending a request and observing which handler answered. These tests
 * therefore boot the router and ask it, rather than reading the table.
 *
 * The previous implementation leaned on Hono's `app.request()`, which called the
 * matcher in-process. Express has no equivalent — it is a listener, not a callable
 * app — so the router is mounted on a real server bound to an ephemeral port and
 * driven with `fetch`. That is a stronger test than the in-process call: it also
 * covers body parsing, which is where a signature check or a JSON body can
 * silently differ from a hand-built request object.
 *
 * ## Compose with `Router`, not `app.use`
 *
 * A test that needs a resolved session should wrap the real router in another
 * `Router` and use `router.use(...)`, rather than mounting middleware on the
 * Express app. `Ctx.set` stores request-scoped state in a map keyed by the
 * underlying request, so app-level middleware holding its own `Ctx` would write to
 * a *different* map and `requireUser` inside the router would see nothing — the
 * fake session would silently not apply and the test would pass for the wrong
 * reason (or 401 and read as a real failure).
 */

export type Harness = {
  /** Issues a request against the mounted router. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Stops the server. Call from `afterAll`, or the port leaks per test file. */
  close(): Promise<void>;
};

/**
 * Boots `router` on port 0 and returns a `request` bound to it.
 *
 * Port 0 asks the OS for a free port, so parallel Vitest files never collide —
 * a hard-coded port would make this suite flaky under `pool: "threads"`.
 */
export async function startRouter(router: Router): Promise<Harness> {
  const app = express();
  app.disable("x-powered-by");

  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        // Stash the exact bytes so `ctx.req.text()` can verify a webhook
        // signature over them, exactly as `createApp` does in production.
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.use(router.toExpress());

  // A router that matches nothing must still answer, or `fetch` hangs forever and
  // the failure surfaces as a timeout in an unrelated test. Mirrors the 404 the
  // real app installs after mounting.
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "API route not found." },
    });
  });

  const server: Server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address() as AddressInfo;

  return {
    request: (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
