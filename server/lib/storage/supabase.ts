import type { AllowedImageMimeType, StorageProvider, UploadTarget } from "./types";

/**
 * Supabase Storage adapter.
 *
 * Talks to the Storage REST API with `fetch` rather than pulling in
 * `@supabase/supabase-js`: the four calls needed here are three URLs and a
 * bearer token, and the SDK would drag in an auth/realtime client this server
 * has no use for. Keeping it to `fetch` also means the adapter has no state to
 * reset between tests.
 *
 * Secrets never leave this file's configuration: `SUPABASE_SERVICE_ROLE_KEY` is
 * used only in a server-to-server `Authorization` header and is never returned
 * to the browser (and is never `VITE_`-prefixed, which would inline it into the
 * client bundle).
 */

const SIGNED_UPLOAD_TTL_MS = 10 * 60 * 1000;

export type SupabaseStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

export function createSupabaseStorageProvider(config: SupabaseStorageConfig): StorageProvider {
  const base = config.url.replace(/\/+$/, "");

  function objectPath(key: string): string {
    return `/storage/v1/object/${config.bucket}/${key}`;
  }

  return {
    name: "supabase",
    isProductionReady: true,
    bucket: config.bucket,

    async createUploadTarget({
      key,
      contentType,
    }: {
      key: string;
      contentType: AllowedImageMimeType;
      byteSize: number;
    }): Promise<UploadTarget> {
      // A signed *upload* URL: it authorises exactly this one object path for a
      // short window, so the browser needs no credentials of its own.
      const response = await fetch(
        `${base}/storage/v1/object/upload/sign/${config.bucket}/${key}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.serviceRoleKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Supabase rejected the upload target (${response.status}): ${detail.slice(0, 200)}`,
        );
      }

      const body = (await response.json()) as { url?: string };
      if (!body.url) throw new Error("Supabase returned no signed upload URL.");

      return {
        key,
        // Supabase returns a root-relative URL (`/object/upload/sign/...`); the
        // browser needs the absolute one, and the `/storage/v1` prefix.
        uploadUrl: `${base}/storage/v1${body.url}`,
        method: "PUT",
        headers: { "Content-Type": contentType, "x-upsert": "true" },
        publicUrl: this.publicUrl(key),
        expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_MS).toISOString(),
      };
    },

    publicUrl(key: string): string {
      return `${base}${objectPath(key)}`.replace("/object/", "/object/public/");
    },

    async deleteObject(key: string): Promise<void> {
      const response = await fetch(`${base}${objectPath(key)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.serviceRoleKey}` },
      });
      // A 404 means it was already gone, which is the state we wanted.
      if (!response.ok && response.status !== 404) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Supabase rejected the delete (${response.status}): ${detail.slice(0, 200)}`,
        );
      }
    },
  };
}

export function readSupabaseStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseStorageConfig | null {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket: env.SUPABASE_BUCKET?.trim() || "product-images" };
}
