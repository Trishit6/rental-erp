import { describe, expect, it } from "vitest";
import { detectImageMimeType, matchesDeclaredImageType } from "../server/lib/storage/magic";

/**
 * Magic-byte image sniffing (PROMPT 20 upload rules).
 *
 * The upload path whitelists the `Content-Type` a caller *presents*, but that header is
 * a claim. These tests pin the property that makes the whitelist meaningful: the bytes
 * decide the type, and a claim that disagrees with the bytes is refused. The SVG case is
 * the one that matters most — it is the image format that can carry script, and the
 * header alone would happily call an SVG `image/png`.
 */

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/** ASCII bytes plus zero padding, so container signatures have room after their markers. */
function ascii(text: string, pad = 8): Uint8Array {
  const out = new Uint8Array(text.length + pad);
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index);
  return out;
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46);
const WEBP = (() => {
  const out = new Uint8Array(16);
  out.set(ascii("RIFF", 0), 0);
  out.set(ascii("WEBP", 0), 8);
  return out;
})();
const AVIF = (() => {
  const out = new Uint8Array(16);
  out.set(ascii("ftyp", 0), 4);
  out.set(ascii("avif", 0), 8);
  return out;
})();

describe("detectImageMimeType", () => {
  it("recognises the raster formats the marketplace serves", () => {
    expect(detectImageMimeType(PNG)).toBe("image/png");
    expect(detectImageMimeType(JPEG)).toBe("image/jpeg");
    expect(detectImageMimeType(WEBP)).toBe("image/webp");
    expect(detectImageMimeType(AVIF)).toBe("image/avif");
  });

  it("returns null for anything that is not an accepted image", () => {
    // SVG is the dangerous one: it renders as an image and can carry script.
    expect(detectImageMimeType(ascii("<svg xmlns=\"http://www.w3.org/2000/svg\">"))).toBeNull();
    expect(detectImageMimeType(ascii("<!DOCTYPE html><html></html>"))).toBeNull();
    expect(detectImageMimeType(ascii("GIF89a"))).toBeNull();
    expect(detectImageMimeType(bytes())).toBeNull();
    expect(detectImageMimeType(ascii("RIFFxxxxWAVE"))).toBeNull();
  });
});

describe("matchesDeclaredImageType", () => {
  it("accepts bytes that are the type the client declared", () => {
    expect(matchesDeclaredImageType(PNG, "image/png")).toBe(true);
    expect(matchesDeclaredImageType(JPEG, "image/jpeg")).toBe(true);
    expect(matchesDeclaredImageType(WEBP, "image/webp")).toBe(true);
    expect(matchesDeclaredImageType(AVIF, "image/avif")).toBe(true);
  });

  it("refuses an SVG body wearing an image/png header", () => {
    // The exact bypass the magic check exists to stop.
    const svg = ascii("<svg><script>alert(1)</script></svg>");
    expect(matchesDeclaredImageType(svg, "image/png")).toBe(false);
    expect(matchesDeclaredImageType(svg, "image/jpeg")).toBe(false);
    expect(matchesDeclaredImageType(svg, "image/webp")).toBe(false);
  });

  it("refuses a genuine image declared as a different image type", () => {
    // A stored object's extension, declared type and real bytes must never disagree.
    expect(matchesDeclaredImageType(WEBP, "image/jpeg")).toBe(false);
    expect(matchesDeclaredImageType(PNG, "image/webp")).toBe(false);
  });
});
