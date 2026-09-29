import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AllowedImageMimeType, StorageProvider, UploadTarget } from "./types";

/**
 * Development storage: real bytes on local disk.
 *
 * This exists so a seller can genuinely pick a file, watch it upload and see it
 * render without anyone provisioning a bucket — the same reasoning as the
 * development payment provider. Its two safety properties are the same ones the
 * payment mock has, for the same reason:
 *
 *  - it is `isProductionReady: false`, and `getStorageProvider` **refuses** to
 *    return it under `NODE_ENV=production` rather than falling back to it;
 *  - it writes only inside one directory, and only for keys matching
 *    `products/<id>/<random>.<ext>` — a key that does not match is rejected
 *    before it is ever turned into a path, so `..` cannot walk out of the folder.
 *
 * `UPLOAD_ROOT` is resolved relative to the server's working directory, and is
 * gitignored.
 */

const UPLOAD_ROOT = join(process.cwd(), "server", "uploads");

/** Where the dev adapter's bytes live on disk. Exported for tests and cleanup. */
export function devUploadRoot(): string {
  return UPLOAD_ROOT;
}

export function devObjectPath(key: string): string {
  return join(UPLOAD_ROOT, key);
}

export function createDevStorageProvider(): StorageProvider {
  return {
    name: "dev_local",
    isProductionReady: false,
    bucket: "local",

    async createUploadTarget({ key, contentType }: { key: string; contentType: AllowedImageMimeType; byteSize: number }): Promise<UploadTarget> {
      // The target points back at this API, because there is no third party to
      // point at. Root-relative on purpose: the SPA already sends every
      // `/api/*` call through the dev proxy, so no origin has to be configured.
      return {
        key,
        uploadUrl: `/api/storage/upload?key=${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "Content-Type": contentType },
        publicUrl: this.publicUrl(key),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
    },

    publicUrl(key: string): string {
      return `/api/storage/local?key=${encodeURIComponent(key)}`;
    },

    async deleteObject(key: string): Promise<void> {
      try {
        await unlink(devObjectPath(key));
      } catch {
        // Already gone is the desired end state, not an error.
      }
    },
  };
}

/** Write bytes for a dev upload. Callers must have validated the key first. */
export async function writeDevObject(key: string, bytes: Uint8Array): Promise<void> {
  const path = devObjectPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function readDevObject(key: string): Promise<Buffer | null> {
  try {
    return await readFile(devObjectPath(key));
  } catch {
    return null;
  }
}
