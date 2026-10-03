import express from "express";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
// Type-only, so it is erased at build time and cannot form a runtime cycle with
// `auth.ts` (which imports `Ctx` from here).
import type { SessionUser } from "./auth";

/**
 * The HTTP layer.
 *
 * Revaro's API used to be a Hono app. Hono is gone; this module is Express, plus
 * the small amount of glue the route files have always expected from their
 * framework — a request-scoped `Ctx` carrying parsed params/query/headers/body,
 * `c.set`/`c.get` for per-request state, and a `Router` that mounts by prefix.
 *
 * ## Why the handlers barely changed
 *
 * Every route in `server/routes` is written against `c.req.param()`,
 * `c.req.query()`, `c.req.json()` and `c.json(...)`. Re-authoring ~7,000 lines of
 * handler logic to a raw `(req, res)` style would have put the real risk in a
 * mechanical diff instead of in the framework swap. So `Ctx` deliberately mirrors
 * that surface, and the migration is confined to this file plus import lines.
 *
 * ## Two behaviours that are load-bearing and easy to lose
 *
 *  1. **Path constraints.** Hono paths like `/:id{[0-9]+}` match *only* numeric
 *     ids, and anything else falls through to a 404. Express 5 dropped inline
 *     regex from its path syntax, so `addRoute` keeps the constraint as a guard
 *     that runs after Express captures the param. A non-numeric id therefore still
 *     404s instead of quietly reaching a handler that would `Number(...)` it into
 *     `NaN` and query for nothing.
 *  2. **Raw bodies.** The payment webhook verifies a signature over the exact
 *     bytes that arrived, so `express.json()` cannot be the only reader —
 *     `bodyParserOptions.verify` stashes the buffer and `ctx.req.text()` returns
 *     it. `storage`'s binary PUT reads the stream directly for the same reason.
 */

/* ----------------------------------- types ---------------------------------- */

export type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number;
  secure?: boolean;
};

export type Ctx = {
  /**
   * The request, in the shape the route handlers have always used.
   */
  req: {
    /**
     * A captured path parameter.
     *
     * Typed `string` rather than `string | undefined` because a handler only runs
     * once its own pattern matched, so the segment is always present — and the
     * digit constraints below 404 before the handler is entered, so a `:id` really
     * is numeric. This matches what Express's own `req.params` promises.
     */
    param(name: string): string;
    param(): Record<string, string>;
    query(name: string): string | undefined;
    query(): Record<string, string | undefined>;
    header(name: string): string | undefined;
    json<T = unknown>(): Promise<T>;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
    /** The underlying Express request, for the rare handler that needs it. */
    raw: Request;
  };
  /**
   * Aborts when the client hangs up.
   *
   * Hono handed every handler a WHATWG `Request`, so `c.req.raw.signal` was free.
   * Express requests have no equivalent, and the chatbot needs one to stop paying
   * for a provider call nobody is listening to any more.
   */
  signal: AbortSignal;
  /** Sends a JSON body. Returns void so `return c.json(...)` stays idiomatic. */
  json(body: unknown, status?: number): void;
  text(body: string, status?: number): void;
  /**
   * Per-request state. `attachUser` publishes the session here; the guards read it.
   *
   * `user` is the only key the API stores, and it is typed rather than left as
   * `unknown` so the ~50 call sites that read `c.get("user")!.id` keep the
   * checking they had when Hono's `ContextVariableMap` declared it. The import is
   * type-only and therefore erased at build time, so this cycle costs nothing at
   * runtime — a runtime `import` here would not be safe.
   */
  set(key: "user", value: SessionUser | null): void;
  get(key: "user"): SessionUser | null;
  res: Response;
  raw: Request;
};

export type Next = () => Promise<void>;
export type Handler = (c: Ctx) => unknown;
export type Middleware = (c: Ctx, next: Next) => unknown;
export type ErrorHandler = (error: unknown, c: Ctx) => unknown;

/* ---------------------------------- cookies --------------------------------- */

function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      jar[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // A malformed percent-escape is not worth failing a request over; the
      // cookie is simply absent, which is exactly how a browser treats it.
    }
  }
  return jar;
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

export function getCookie(c: Ctx, name: string): string | undefined {
  const header = c.req.header("cookie");
  if (!header) return undefined;
  return parseCookies(header)[name];
}

export function setCookie(c: Ctx, name: string, value: string, options?: CookieOptions): void {
  const existing = c.res.getHeader("Set-Cookie");
  const cookie = serializeCookie(name, value, options);
  if (Array.isArray(existing)) c.res.setHeader("Set-Cookie", [...existing, cookie]);
  else if (typeof existing === "string") c.res.setHeader("Set-Cookie", [existing, cookie]);
  else c.res.setHeader("Set-Cookie", cookie);
}

/**
 * Expires a cookie.
 *
 * The `options` argument exists because the path has to match the one the cookie
 * was written with — a deletion at the wrong path is silently ignored by the
 * browser, and the session cookie would outlive the logout that was meant to clear it.
 */
export function deleteCookie(c: Ctx, name: string, options?: CookieOptions): void {
  setCookie(c, name, "", { ...options, maxAge: 0 });
}

/* ------------------------------ request context ----------------------------- */

/** Where `Ctx.set`/`Ctx.get` keep their state for the life of the request. */
type Vars = Map<string, unknown>;

function varsOf(req: Request): Vars {
  const holder = req as Request & { __vars?: Vars };
  holder.__vars ??= new Map<string, unknown>();
  return holder.__vars;
}

/**
 * Reads the whole request stream.
 *
 * Only used where a body parser has not already consumed it: the binary storage
 * PUT and the webhook's raw-body verification. Express has no equivalent of
 * Hono's `arrayBuffer()`, and buffering here is bounded by the size checks each
 * of those two handlers performs *before* calling this.
 */
async function readStream(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike));
  }
  return Buffer.concat(chunks);
}

/**
 * The per-request `AbortController`, created on first use.
 *
 * `createCtx` runs once per router layer and per handler, so without this a
 * request crossing a mounted sub-router would attach a `close` listener each
 * time and eventually trip Node's max-listeners warning. One controller per
 * request also means the chatbot's provider call and the middleware share a
 * single signal, rather than each holding their own.
 */
function abortSignalOf(req: Request, res: Response): AbortSignal {
  const holder = req as Request & { __abort?: AbortController };
  if (!holder.__abort) {
    const controller = new AbortController();
    holder.__abort = controller;
    res.on("close", () => {
      // Only a *premature* close is an abort. `close` also fires after a normal
      // response finishes, and aborting then would reject work that already
      // succeeded.
      if (!res.writableEnded) controller.abort();
    });
  }
  return holder.__abort.signal;
}

function createCtx(req: Request, res: Response): Ctx {
  const vars = varsOf(req);
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signal = abortSignalOf(req, res);

  return {
    req: {
      param: ((name?: string) => {
        const params = (req.params ?? {}) as Record<string, string>;
        return name === undefined ? params : params[name];
      }) as Ctx["req"]["param"],
      query: ((name?: string) => {
        const query = (req.query ?? {}) as Record<string, string | undefined>;
        return name === undefined ? query : query[name];
      }) as Ctx["req"]["query"],
      header: (name: string) => req.get(name) ?? undefined,
      json: async <T>() => req.body as T,
      text: async () => {
        if (rawBody) return rawBody.toString("utf8");
        // A body parser may already hold it as a string or a buffer.
        if (typeof req.body === "string") return req.body;
        if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
        return (await readStream(req)).toString("utf8");
      },
      arrayBuffer: async () => {
        // `express.raw` already drained the stream for the binary upload, so
        // re-reading it here would hang rather than return empty bytes.
        const buffer = rawBody ?? (Buffer.isBuffer(req.body) ? req.body : await readStream(req));
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer;
      },
      raw: req,
    },
    json: (body, status) => {
      res.status(status ?? 200).json(body);
    },
    text: (body, status) => {
      res
        .status(status ?? 200)
        .type("text/plain")
        .send(body);
    },
    set: (key, value) => {
      vars.set(key, value);
    },
    get: (key) => (vars.get(key) as SessionUser | null | undefined) ?? null,
    signal,
    res,
    raw: req,
  };
}

/* ---------------------------------- router ---------------------------------- */

/**
 * Path compilation.
 *
 * ## Why this exists instead of `express.Router()`
 *
 * The route files use constrained parameters — `/:id{[0-9]+}` — and that constraint
 * is load-bearing, not decoration. `review-routes.test.ts` documents the bug it
 * prevents: with an unconstrained `/:id` registered above `GET /mine`, the router
 * matches `/mine` as an id, the handler coerces `"mine"` to `NaN`, and the
 * collection route 404s while every other test passes.
 *
 * Express 5 cannot express that constraint. It ships path-to-regexp v8, which
 * removed inline regex from path strings outright — registering `/:id(\d+)` throws
 * `PathError: Unexpected (`, not a warning. The obvious workaround, matching
 * `:id` and then re-checking the value in a guard, is *worse than nothing*: the
 * guard has to 404 (the value genuinely is not an id), which terminates the chain
 * instead of letting the next route try. So `GET /mine` 404s anyway, and the
 * constraint re-creates the exact shadowing bug it exists to prevent.
 *
 * Compiling the constraint into the matcher fixes that properly: `/:id{[0-9]+}`
 * simply does not match `mine`, so the router moves on to `/mine`'s own handler.
 * Falling through on no-match also makes mounting additive — a request to
 * `/api/products/search/...` enters the `/api/products` mount first, matches
 * nothing, and continues to the `/api/products/search` mount.
 */

export type CompiledPath = {
  regexp: RegExp;
  /** Positional capture names, so `match()` can build `req.params`. */
  names: string[];
};

const compiledCache = new Map<string, CompiledPath>();

function escapeLiteral(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compilePath(path: string): CompiledPath {
  const cached = compiledCache.get(path);
  if (cached) return cached;

  const names: string[] = [];
  // `/` and `""` both mean the mount root.
  const body = path === "/" || path === "*" ? "" : path.replace(/^\/+|\/+$/g, "");
  let source = "";

  for (const segment of body.split("/").filter(Boolean)) {
    source += "/";
    const named = /^:([A-Za-z0-9_]+)(?:\{(.+)\})?$/.exec(segment);
    if (named) {
      names.push(named[1]!);
      // No constraint means "one path segment, anything but a slash".
      source += named[2] ? `(${named[2]})` : "([^/]+)";
    } else if (segment === "*") {
      names.push("*");
      source += "(.*)";
    } else {
      source += escapeLiteral(segment);
    }
  }

  const compiled: CompiledPath = {
    // The trailing `/?` lets `/reviews` and `/reviews/` reach the same route.
    regexp: new RegExp(`^${source || "/"}/?$`),
    names,
  };
  compiledCache.set(path, compiled);
  return compiled;
}

/** Resolves a compiled path against a request path, yielding captured params. */
function matchPath(compiled: CompiledPath, path: string): Record<string, string> | null {
  const found = compiled.regexp.exec(path);
  if (!found) return null;
  const params: Record<string, string> = {};
  compiled.names.forEach((name, index) => {
    params[name] = found[index + 1] ?? "";
  });
  return params;
}

const prefixCache = new Map<string, RegExp>();

/**
 * Compiles a *mount* prefix, which matches a whole path rather than one pattern.
 *
 * Two differences from `compilePath`, both of which caused real failures:
 *
 *  - It is anchored only at the start. `route("/")` has to cover every path below
 *    it, and an exact matcher (`^//?$`) matched only the root itself — which
 *    silently 404'd every endpoint in the router mounted beneath it.
 *  - It requires a segment boundary, so the `/api/seller` mount does not swallow
 *    `/api/sellers`. Express's own `use` is segment-aware for the same reason.
 *
 * Prefix parameters are matched but not captured: no caller reads them, and
 * non-capturing groups keep the shape honest about that.
 */
function compilePrefix(path: string): RegExp {
  const cached = prefixCache.get(path);
  if (cached) return cached;

  const body = path === "/" || path === "*" ? "" : path.replace(/^\/+|\/+$/g, "");
  let source = "";

  for (const segment of body.split("/").filter(Boolean)) {
    source += "/";
    const named = /^:([A-Za-z0-9_]+)(?:\{(.+)\})?$/.exec(segment);
    if (named) source += named[2] ? `(?:${named[2]})` : "[^/]+";
    else if (segment === "*") source += "(?:.*)";
    else source += escapeLiteral(segment);
  }

  // An empty prefix is the mount root and matches everything.
  const regexp = new RegExp(source ? `^${source}(?:/|$)` : "^");
  prefixCache.set(path, regexp);
  return regexp;
}

/** Strips a query string; `req.path` already excludes it, but mounts do not. */
function pathOnly(url: string): string {
  const query = url.indexOf("?");
  return query < 0 ? url : url.slice(0, query);
}

/**
 * Canonical form of a mount prefix: leading slash kept, trailing slash removed.
 * The mount root becomes `""`, which `stripBase` treats as "no prefix".
 */
function normalizePrefix(prefix: string): string {
  if (prefix === "/" || prefix === "*") return "";
  return `/${prefix.replace(/^\/+|\/+$/g, "")}`;
}

/**
 * Removes a mount prefix, yielding the path a sub-router should match against.
 *
 * The mount root itself becomes `/` rather than `""`, because `""` is not a path and
 * a router's own `GET /` route must still answer for the bare prefix.
 */
function stripBase(path: string, base: string): string {
  if (!base || base === "/") return path;
  if (path === base) return "/";
  return path.startsWith(`${base}/`) ? path.slice(base.length) : path;
}

/**
 * One step in a router's chain.
 *
 * Middleware and mounts are kept as separate kinds rather than both being
 * `Middleware` because they disagree about what "continue" means. Middleware's
 * `next()` advances to the following step; a mount's `next()` means *nothing
 * inside this sub-router matched*, so it must resume the parent chain — and, when
 * it carries an error, it must hand that error to the parent's error handler.
 * Collapsing the two loses the error and turns every failure into a 404.
 */
type ChainEntry =
  | { kind: "middleware"; prefix: RegExp | null; handler: Middleware }
  | { kind: "mount"; prefix: RegExp | null; prefixText: string; sub: Router };

type RouteEntry = {
  method: string;
  /** As declared, so `routes()` reports what a maintainer wrote. */
  path: string;
  compiled: CompiledPath;
  handler: Handler;
};

/**
 * A mounted group of routes.
 *
 * Deliberately mirrors the surface `server/index.ts` and the route files already
 * use — `use`, the five verbs, `route(prefix, router)` — so mounting reads the
 * same as before.
 */
export class Router {
  private readonly routes_: RouteEntry[] = [];
  private readonly chain: ChainEntry[] = [];
  private readonly onErrorHandlers: ErrorHandler[] = [];
  /**
   * Assembled handlers, keyed by mount prefix — one router mounted at two prefixes
   * needs two, because each strips a different base.
   */
  private readonly compiled = new Map<string, RequestHandler>();

  onError(handler: ErrorHandler): this {
    this.onErrorHandlers.push(handler);
    this.compiled.clear();
    return this;
  }

  use(pathOrMiddleware: string | Middleware, maybeMiddleware?: Middleware): this {
    if (typeof pathOrMiddleware === "string") {
      if (!maybeMiddleware) return this;
      // `use("*")` and `use("/")` both meant "every path in this router".
      const every = pathOrMiddleware === "*" || pathOrMiddleware === "/";
      this.chain.push({
        kind: "middleware",
        prefix: every ? null : compilePrefix(pathOrMiddleware),
        handler: maybeMiddleware,
      });
    } else {
      this.chain.push({ kind: "middleware", prefix: null, handler: pathOrMiddleware });
    }
    this.compiled.clear();
    return this;
  }

  private add(method: string, path: string, handler: Handler) {
    this.routes_.push({ method, path, compiled: compilePath(path), handler });
    this.compiled.clear();
    return this;
  }

  get = (path: string, handler: Handler) => this.add("GET", path, handler);
  post = (path: string, handler: Handler) => this.add("POST", path, handler);
  put = (path: string, handler: Handler) => this.add("PUT", path, handler);
  patch = (path: string, handler: Handler) => this.add("PATCH", path, handler);
  delete = (path: string, handler: Handler) => this.add("DELETE", path, handler);

  /** Mount another router under a prefix — Hono's `app.route(prefix, sub)`. */
  route(prefix: string, sub: Router): this {
    // `use`, not a verb: a sub-router is a prefix group, and it must still be
    // reachable when nothing inside it matches so the next mount can try.
    this.chain.push({
      kind: "mount",
      prefix: compilePrefix(prefix),
      prefixText: normalizePrefix(prefix),
      sub,
    });
    this.compiled.clear();
    return this;
  }

  /** The route table, for tests that assert which endpoints exist. */
  routes(): { method: string; path: string }[] {
    return this.routes_.map(({ method, path }) => ({ method, path }));
  }

  /**
   * The Express handler for this router.
   *
   * `base` is the prefix this router was mounted at, and it is passed down
   * explicitly rather than left to Express. Express strips a mount prefix inside
   * `app.use(prefix, ...)`, but a sub-router mounted by *another Router* is just a
   * function call, so it still sees the full path — which made every mounted
   * router 404 on its own `/` route. Stripping here keeps each router's patterns
   * written relative to its own mount, which is how every route file is written.
   */
  toExpress(base = ""): RequestHandler {
    const cached = this.compiled.get(base);
    if (cached) return cached;
    const built = this.build(base);
    this.compiled.set(base, built);
    return built;
  }

  private build(base: string): RequestHandler {
    // Mounted as a `use` handler rather than a verb so an unmatched path falls
    // through to the parent instead of 404-ing inside the sub-router.
    return (req: Request, res: Response, next: NextFunction) => {
      const path = stripBase(pathOnly(req.path), base);

      // First match wins, in registration order — the same rule Hono applied, and
      // the reason the digit constraints have to be part of the matcher.
      const route = this.routes_.find(
        (entry) => entry.method === req.method && matchPath(entry.compiled, path) !== null,
      );
      if (!route) {
        // No route here. Middleware still runs, because a gate like
        // `requireSeller` is registered with `use` and answers *before* routing in
        // Hono too; if it declines, control passes to the next mount.
        this.runMiddleware(req, res, base, null, next);
        return;
      }

      // Written onto the request because `Ctx.req.param` reads `req.params`.
      (req as Request & { params?: Record<string, string> }).params =
        matchPath(route.compiled, path) ?? {};
      this.runMiddleware(req, res, base, route, next);
    };
  }

  /**
   * Runs this router's chain, then either the matched handler or `next()`.
   *
   * Each step's `next()` advances to the following one; the last hands off to the
   * handler, or to Express when nothing matched.
   */
  private runMiddleware(
    req: Request,
    res: Response,
    base: string,
    route: RouteEntry | null,
    next: NextFunction,
  ): void {
    const path = stripBase(pathOnly(req.path), base);
    const chain = this.chain.filter((entry) => entry.prefix === null || entry.prefix.test(path));

    const step = (index: number): void => {
      const entry = chain[index];
      if (!entry) {
        if (route) {
          const c = createCtx(req, res);
          void (async () => {
            const result = await route.handler(c);
            // A handler may answer directly with a `Response` (the storage binary
            // GET does). Hono allowed this; keeping it means those handlers are
            // unchanged. `c.json` has already replied by this point.
            if (result instanceof Response && !res.headersSent) {
              res.status(result.status);
              result.headers.forEach((value, key) => res.setHeader(key, value));
              res.send(Buffer.from(await result.arrayBuffer()));
            }
          })().catch((error: unknown) => this.fail(error, req, res, next));
          return;
        }
        next();
        return;
      }

      if (entry.kind === "mount") {
        // `prefixText` is what the sub-router must *strip*, not what is left over.
        // Its `next()` resumes *this* chain; an error goes to *this* router's
        // handler, which is what lets a sub-router without its own `onError`
        // surface an HttpError through the root, exactly as Hono's root
        // `app.onError` did.
        entry.sub.toExpress(entry.prefixText)(req, res, (error?: unknown) => {
          if (error) {
            this.fail(error, req, res, next);
            return;
          }
          step(index + 1);
        });
        return;
      }

      const c = createCtx(req, res);
      let advanced = false;
      void (async () => {
        await entry.handler(c, async () => {
          advanced = true;
          step(index + 1);
        });
        // A middleware that answered instead of calling `next()` — a rate limiter,
        // a 401 — must not fall through to the handler behind it.
        if (!advanced && !res.headersSent) step(index + 1);
      })().catch((error: unknown) => this.fail(error, req, res, next));
    };

    step(0);
  }

  /** Routes a throw to this router's error handler, or onward if it has none. */
  private fail(error: unknown, req: Request, res: Response, next: NextFunction): void {
    const handle = this.onErrorHandlers[0];
    if (!handle) {
      next(error);
      return;
    }
    void (async () => {
      try {
        const result = await handle(error, createCtx(req, res));
        if (result instanceof Response && !res.headersSent) {
          res.status(result.status);
          result.headers.forEach((value, key) => res.setHeader(key, value));
          res.send(Buffer.from(await result.arrayBuffer()));
        }
      } catch (nested) {
        next(nested);
      }
    })();
  }
}

/* ----------------------------------- app ------------------------------------ */

export type AppOptions = {
  /** Stashes the raw body so a signature can be verified over the exact bytes. */
  captureRawBody?: boolean;
};

export function createApp(options: AppOptions = {}): { app: Express; router: Router } {
  const app = express();
  const router = new Router();

  app.use(
    express.json({
      limit: "2mb",
      verify: options.captureRawBody
        ? (req, _res, buf) => {
            (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
          }
        : undefined,
    }),
  );
  // Uploads arrive as raw image bytes; this must not try to parse them, and the
  // route reads them off the stream itself after checking Content-Length.
  app.use(
    express.urlencoded({ extended: false, limit: "1mb" }),
    express.raw({ type: () => true, limit: "1mb" }),
  );

  return { app, router };
}

export type { NextFunction, Request, RequestHandler, Response };
