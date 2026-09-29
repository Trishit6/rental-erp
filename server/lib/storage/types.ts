/**
 * Object storage for seller-uploaded product images.
 *
 * The provider is an **interface**, exactly like `server/lib/payments`: nothing
 * outside this folder knows whether it is talking to Supabase, to local disk, or
 * to a gateway that does not exist yet. Adding a provider is one new adapter
 * file plus an env var.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **No image binary ever touches MariaDB.** The database stores a URL.
 *  2. **The client never writes to the bucket directly.** It asks for a
 *     short-lived, single-object upload target that this server minted, and the
 *     key inside that target is derived from the authenticated seller's id — so
 *     an upload can never be aimed at someone else's object.
 */

/** Image types we accept. Anything else is refused, whatever it claims to be. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * The extension is derived **from the MIME type**, never from the uploaded
 * filename. A file called `payload.jpg` that presents as `text/html` is not an
 * image and is rejected before this mapping is reached; a genuine image is stored
 * under the extension its bytes imply, so the stored name cannot lie either.
 */
export const IMAGE_EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** 5 MB. Large enough for a phone photo, small enough to refuse a payload dump. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How many images one listing may carry (mirrors the client form's limit). */
export const MAX_IMAGES_PER_LISTING = 8;

/**
 * Object keys are `products/<sellerId>/<random>.<ext>`.
 *
 * The key shape is a security boundary, not a naming convention: it is
 * validated on both mint and delete, so a key can never contain `..`, a leading
 * slash or another seller's id, and therefore can never escape its prefix or
 * address a foreign object.
 */
export const OBJECT_KEY_PATTERN = /^products\/\d+\/[a-z0-9]{8,32}\.(jpg|png|webp|avif)$/;

export type UploadTarget = {
  /** Provider-agnostic object key. Persist this, not the public URL. */
  key: string;
  /** Where the browser PUTs the bytes. */
  uploadUrl: string;
  /** HTTP method the upload URL expects. */
  method: "PUT";
  /** Extra headers the browser must send for the upload to be accepted. */
  headers: Record<string, string>;
  /** The URL to store on the product row once the upload succeeds. */
  publicUrl: string;
  /** ISO timestamp; the target is refused after this. */
  expiresAt: string;
};

export type StorageProvider = {
  readonly name: string;
  /**
   * False for the local development adapter, which is refused under
   * `NODE_ENV=production`. Surfaced to the client so the seller UI can say so
   * rather than presenting a dev upload as a real one.
   */
  readonly isProductionReady: boolean;
  readonly bucket: string;
  createUploadTarget(input: {
    key: string;
    contentType: AllowedImageMimeType;
    byteSize: number;
  }): Promise<UploadTarget>;
  publicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
};

export function isAllowedImageMimeType(value: unknown): value is AllowedImageMimeType {
  return (
    typeof value === "string" && (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}

export function isValidObjectKey(key: string): boolean {
  return OBJECT_KEY_PATTERN.test(key);
}

/**
 * Mint a key for a new object. `<random>` is opaque on purpose: a
 * seller-chosen name would let one seller probe another's objects, and it keeps
 * two uploads of `photo.jpg` from colliding.
 */
export function buildObjectKey(sellerId: number, contentType: AllowedImageMimeType): string {
  const random = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
  return `products/${sellerId}/${random}.${IMAGE_EXTENSION_BY_MIME[contentType]}`;
}
