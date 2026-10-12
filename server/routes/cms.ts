import { Router } from "../lib/http";
import { HttpError, ok } from "../lib/api";
import { bannerPlacementSchema } from "../lib/enums";
import { getPublicBlock, listPublicBanners, listPublicBlocks } from "../lib/cms";

/**
 * The public content API (PROMPT 26).
 *
 * Mounted with no guard on purpose: this is exactly the content the storefront
 * renders for an anonymous visitor. Everything it returns is already filtered to
 * what a visitor may see — a `DRAFT` block and an out-of-window banner are simply
 * absent, never returned with a flag the client is trusted to honour.
 */
export const cmsRoute = new Router();

/**
 * `GET /api/cms/banners?placement=HERO` — live banners, in order.
 *
 * Omitting `placement` returns every live banner, which the home page uses to fill
 * several slots in one request rather than one per band.
 */
cmsRoute.get("/banners", async (c) => {
  const raw = c.req.query("placement");
  const placement = raw ? bannerPlacementSchema.parse(raw) : null;
  return c.json(ok(await listPublicBanners(placement)));
});

/** `GET /api/cms/blocks` — every published block, keyed by block key. */
cmsRoute.get("/blocks", async (c) => {
  return c.json(ok(await listPublicBlocks()));
});

/** `GET /api/cms/blocks/:key` — one published block, or 404. */
cmsRoute.get("/blocks/:key", async (c) => {
  const key = c.req.param("key");
  const content = await getPublicBlock(key);
  if (!content) throw new HttpError(404, "NOT_FOUND", "Content not found.");
  return c.json(ok({ key, content }));
});
