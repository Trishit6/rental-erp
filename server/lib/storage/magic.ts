import type { AllowedImageMimeType } from "./types";

/**
 * Magic-byte image sniffing.
 *
 * ## Why a declared Content-Type is not enough
 *
 * The upload path already whitelists the `Content-Type` a caller presents, but that
 * header is the caller's *claim*. An attacker can send `Content-Type: image/png`
 * with an HTML or SVG body: nothing about the bytes stops the claim from being
 * false. Storing that object and serving it back — even with `nosniff` — is one
 * provider misconfiguration away from stored XSS, and it means a file that is not
 * an image at all has been accepted as one.
 *
 * This module checks the bytes themselves. It returns the MIME type the file
 * actually is, or `null` when the bytes match no signature we accept. The caller
 * compares that against the declared type, so a mismatch is a rejection rather
 * than a silent reclassification.
 *
 * ## Why the recognised set is closed and small
 *
 * Only the raster formats the marketplace serves are detected — PNG, JPEG, WebP
 * and AVIF. SVG is deliberately absent: it is a script-bearing document that
 * merely happens to render as an image, which is exactly the format that turns an
 * avatar into a payload. It fails detection (`null`) and is refused.
 */

function matches(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }
  return true;
}

/** The four characters at `offset`, as ASCII, or `""` when the buffer is short. */
function asciiAt(bytes: Uint8Array, offset: number): string {
  if (bytes.length < offset + 4) return "";
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

/**
 * The MIME type the bytes actually are, or `null` if they are not an accepted
 * raster image.
 *
 * The signatures are checked in order; PNG and JPEG are decided from their first
 * bytes, while WebP and AVIF are container formats whose markers sit at fixed
 * offsets (`RIFF....WEBP` and `....ftyp<brand>` respectively).
 */
export function detectImageMimeType(bytes: Uint8Array): AllowedImageMimeType | null {
  if (matches(bytes, PNG_SIGNATURE)) return "image/png";
  if (matches(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  if (asciiAt(bytes, 0) === "RIFF" && asciiAt(bytes, 8) === "WEBP") return "image/webp";
  if (asciiAt(bytes, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8);
    // `avif` is a still image, `avis` an image sequence — both are AVIF content.
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/**
 * Whether the bytes are the image type the client declared.
 *
 * Both halves are required: the bytes must detect as *some* accepted image, and
 * that type must equal the declared one. A genuine WebP uploaded as
 * `image/jpeg` is a mismatch and is refused, so a stored object's extension,
 * declared type and real bytes can never disagree.
 */
export function matchesDeclaredImageType(
  bytes: Uint8Array,
  declared: AllowedImageMimeType,
): boolean {
  return detectImageMimeType(bytes) === declared;
}
