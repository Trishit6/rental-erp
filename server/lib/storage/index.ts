import { HttpError } from "../api";
import { createDevStorageProvider } from "./dev";
import { createSupabaseStorageProvider, readSupabaseStorageConfig } from "./supabase";
import type { StorageProvider } from "./types";

/**
 * Storage provider configuration.
 *
 * Secrets live here and only here. Nothing in this module is returned to the
 * browser, and no `SUPABASE_*` variable is prefixed with `VITE_` for exactly
 * that reason — a `VITE_`-prefixed value is inlined into the client bundle.
 */
export type StorageConfig = {
  /** Selected provider name. Empty/unset/`dev` all mean local development storage. */
  provider: string;
  /** True when the local disk adapter is in use. */
  isDevelopmentAdapter: boolean;
};

const DEV_ALIASES = new Set(["", "dev", "local", "dev_local", "none"]);

export function readStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const raw = (env.STORAGE_PROVIDER ?? "").trim();
  const isDevelopmentAdapter = DEV_ALIASES.has(raw.toLowerCase());
  return {
    provider: isDevelopmentAdapter ? "dev_local" : raw,
    isDevelopmentAdapter,
  };
}

let cached: StorageProvider | null = null;

/**
 * Resolve the configured provider.
 *
 * The refusals mirror `getPaymentProvider` deliberately:
 *
 *  - the local disk adapter will not run under `NODE_ENV=production`, so a
 *    deployment cannot quietly accept uploads onto a container's ephemeral
 *    filesystem and lose every one of them on the next restart;
 *  - a real provider name with no keys is a 503, never a silent fallback to it;
 *  - an unrecognised provider name is a 503 too.
 */
export function getStorageProvider(config = readStorageConfig()): StorageProvider {
  if (config.isDevelopmentAdapter) {
    if ((process.env.NODE_ENV ?? "development") === "production") {
      throw new HttpError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Image uploads are not configured for this environment.",
      );
    }
    cached ??= createDevStorageProvider();
    return cached;
  }

  if (config.provider === "supabase") {
    const supabase = readSupabaseStorageConfig();
    if (!supabase) {
      throw new HttpError(
        503,
        "STORAGE_NOT_CONFIGURED",
        "Image uploads are not configured for this environment.",
      );
    }
    cached ??= createSupabaseStorageProvider(supabase);
    return cached;
  }

  throw new HttpError(
    503,
    "STORAGE_NOT_CONFIGURED",
    "Image uploads are not configured for this environment.",
  );
}

/** Test seam: drop the memoised provider so env changes take effect. */
export function resetStorageProviderCache(): void {
  cached = null;
}

/**
 * Hosts an image URL may point at.
 *
 * Uploads land in the configured bucket, and the seed data references Unsplash's
 * CDN. Anything else is refused: without this list a listing could point at an
 * arbitrary host, which turns a product page into a request for third-party
 * content the marketplace never vetted (and a tracker under a seller's control).
 */
export function allowedImageHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set<string>(["images.unsplash.com"]);
  const supabase = readSupabaseStorageConfig(env);
  if (supabase) {
    try {
      hosts.add(new URL(supabase.url).host);
    } catch {
      // A malformed SUPABASE_URL is already a configuration error reported by
      // `getStorageProvider`; it must not also crash URL validation here.
    }
  }
  return [...hosts];
}

export * from "./types";
