/**
 * Image URL validation for user-supplied media.
 *
 * Every image on Revaro is either something this deployment uploaded or a
 * placeholder the seed data references. Both the review form and the seller's
 * product form accept raw URLs, and both must therefore answer the same
 * question: *may this URL be loaded on a page that other people will visit?*
 *
 * Without an answer, a listing (or a review) can point at an arbitrary host,
 * which turns a product page into a request for third-party content nobody
 * vetted, plus a beacon under the submitter's control — including one that
 * reports back "this visitor is now looking at product 41", at whatever
 * resolution they can name.
 *
 * Kept in its own module rather than beside the review rules because it is
 * shared by review images, product images and anything else that renders
 * seller-supplied media. `allowedImageHosts()` (in `lib/storage`) is the
 * authority on *which* hosts; this is the authority on *how* a URL is judged.
 */
export function imageUrlError(url: string, allowedHosts: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That image address isn't valid.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Images must be served over http or https.";
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.host)) {
    return "Images must come from Revaro's image storage.";
  }
  return null;
}

/** Every problem with a set of image URLs, in submission order. */
export function imageUrlErrors(urls: readonly string[], allowedHosts: readonly string[]): string[] {
  return urls
    .map((url) => imageUrlError(url, allowedHosts))
    .filter((problem): problem is string => problem !== null);
}
