import { Router } from "../lib/http";
import { z } from "zod";
import { ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";
import { getStorageProvider, readStorageConfig } from "../lib/storage";
import { readDevObject, writeDevObject } from "../lib/storage/dev";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  buildObjectKey,
  isStorageScope,
  isValidObjectKey,
  ownsObjectKey,
  scopeOfObjectKey,
  isAllowedImageMimeType,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_LISTING,
  type StorageScope,
} from "../lib/storage/types";

export const storageRoute = new Router();

/* --------------------------------- config ---------------------------------- */

/**
 * What the seller UI needs to render an upload control: the limits and whether
 * this deployment can actually store anything. No secret is included — the
 * provider's *name* and its production-readiness are the only facts the browser
 * gets, which is exactly what the "development storage" banner needs.
 */
storageRoute.get("/config", async (c) => {
  const config = readStorageConfig();
  let available = true;
  try {
    getStorageProvider(config);
  } catch {
    available = false;
  }
  return c.json(
    ok({
      available,
      provider: config.provider,
      isDevelopmentAdapter: config.isDevelopmentAdapter,
      maxBytes: MAX_IMAGE_BYTES,
      maxImages: MAX_IMAGES_PER_LISTING,
      allowedTypes: ALLOWED_IMAGE_MIME_TYPES,
    }),
  );
});

/* ------------------------------ upload target ------------------------------ */

const uploadTargetSchema = z
  .object({
    contentType: z.string().trim(),
    byteSize: z.number().int().positive(),
    /**
     * Which kind of object this is. Defaults to `products` so the existing
     * product-image callers — and every request that predates avatars — keep working
     * unchanged.
     */
    scope: z.string().trim().optional(),
  })
  .strict();

/**
 * Mint a single-object upload target.
 *
 * The key is derived from the **authenticated** user's id and the requested scope, never
 * from the request, so this endpoint cannot be used to obtain write access to another
 * account's prefix no matter what the body says.
 *
 * The scope is validated against `STORAGE_SCOPES` rather than interpolated into the key:
 * an unrecognised value is a 400, so the shape of every key this endpoint can produce is
 * closed by `isValidObjectKey`, which the upload and delete paths both re-check.
 */
storageRoute.post("/upload-target", async (c) => {
  const user = requireUser(c);
  const input = uploadTargetSchema.parse(await c.req.json());

  const scope: StorageScope = input.scope === undefined ? "products" : input.scope as StorageScope;
  if (!isStorageScope(scope)) {
    throw new HttpError(400, "UNSUPPORTED_SCOPE", "That kind of upload is not supported.");
  }

  if (!isAllowedImageMimeType(input.contentType)) {
    throw new HttpError(400, "UNSUPPORTED_IMAGE_TYPE", "Use a JPEG, PNG, WebP or AVIF image.");
  }
  if (input.byteSize > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", `Images must be under ${MAX_IMAGE_BYTES} bytes.`);
  }

  const provider = getStorageProvider();
  const key = buildObjectKey(scope, user.id, input.contentType);
  const target = await provider.createUploadTarget({
    key,
    contentType: input.contentType,
    byteSize: input.byteSize,
  });

  return c.json(ok(target), 201);
});

/* ----------------------------- development sink ---------------------------- */

/**
 * The local development adapter's upload endpoint.
 *
 * Every check the real provider performs on its side is performed here, because
 * here the marketplace *is* the provider: the MIME type is whitelisted, the size
 * is capped from `Content-Length` before the body is read, and the object key is
 * validated as a real key for the *current* seller. A key outside the caller's
 * own prefix is a 403, not a silent write somewhere else.
 */
storageRoute.put("/upload", async (c) => {
  const user = requireUser(c);
  if (!readStorageConfig().isDevelopmentAdapter) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }

  const key = c.req.query("key") ?? "";
  // The scope is read back out of the key and the prefix is derived from it, rather
  // than the check being hardcoded to `products/`. That is what lets an avatar upload
  // work without duplicating this handler — and it keeps one rule for ownership: a key
  // must be well-formed *and* start with the caller's own prefix within its own scope.
  const scope = scopeOfObjectKey(key);
  if (!scope || !ownsObjectKey(key, scope, user.id)) {
    throw new HttpError(403, "FORBIDDEN", "That upload key belongs to another account.");
  }

  const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
  if (!isAllowedImageMimeType(contentType)) {
    throw new HttpError(400, "UNSUPPORTED_IMAGE_TYPE", "Use a JPEG, PNG, WebP or AVIF image.");
  }

  // Checked before reading the body, so an enormous PUT is refused rather than
  // buffered into memory first.
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    throw new HttpError(411, "LENGTH_REQUIRED", "An upload must state its size.");
  }
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", `Images must be under ${MAX_IMAGE_BYTES} bytes.`);
  }

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  // Belt and braces: Content-Length is a claim, and this is the real length.
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", `Images must be under ${MAX_IMAGE_BYTES} bytes.`);
  }

  await writeDevObject(key, bytes);
  return c.json(ok({ key, byteSize: bytes.byteLength }));
});

/** Serve a locally stored object. */
storageRoute.get("/local", async (c) => {
  if (!readStorageConfig().isDevelopmentAdapter) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }
  const key = c.req.query("key") ?? "";
  if (!isValidObjectKey(key)) throw new HttpError(400, "BAD_REQUEST", "Invalid key.");

  const bytes = await readDevObject(key);
  if (!bytes) throw new HttpError(404, "NOT_FOUND", "Image not found.");

  const ext = key.slice(key.lastIndexOf(".") + 1);
  const type =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "avif"
          ? "image/avif"
          : "image/jpeg";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Local uploads are seller-supplied content; never let a browser sniff
      // them into something executable.
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/* --------------------------------- delete ---------------------------------- */

const deleteSchema = z.object({ key: z.string().trim().min(1).max(300) }).strict();

/** Delete an object the caller owns. */
storageRoute.delete("/object", async (c) => {
  const user = requireUser(c);
  const { key } = deleteSchema.parse(await c.req.json());
  if (!isValidObjectKey(key)) throw new HttpError(400, "BAD_REQUEST", "Invalid key.");
  const scope = scopeOfObjectKey(key);
  if (!scope || !ownsObjectKey(key, scope, user.id)) {
    throw new HttpError(403, "FORBIDDEN", "That image belongs to another account.");
  }

  await getStorageProvider().deleteObject(key);
  return c.json(ok({ deleted: true }));
});
