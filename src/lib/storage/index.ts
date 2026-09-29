import { api } from "@/lib/api/client";

/**
 * Client side of product-image storage.
 *
 * The feature never talks to a bucket directly: it asks this module, which asks
 * the API for a single-object upload target and then PUTs the bytes to it. That
 * is what keeps the storage provider swappable — the seller UI has no idea
 * whether it is uploading to Supabase, to local disk, or to something that does
 * not exist yet.
 *
 * **Why XMLHttpRequest.** `fetch` cannot report upload progress, and a 5 MB
 * photo on a phone is exactly the case where "nothing is happening" reads as
 * broken. This is the one place in the app that uses XHR, and it is confined
 * here: components still call a function, and nothing in a component imports
 * this module's internals.
 */

export type ImageUploadConfig = {
  available: boolean;
  provider: string;
  isDevelopmentAdapter: boolean;
  maxBytes: number;
  maxImages: number;
  allowedTypes: string[];
};

export type UploadedImage = {
  /** The object key. Needed to delete the image again. */
  key: string;
  /** What goes on the product row. */
  publicUrl: string;
};

type UploadTarget = {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  publicUrl: string;
  expiresAt: string;
};

export async function fetchImageUploadConfig(): Promise<ImageUploadConfig> {
  const { data } = await api.get<ImageUploadConfig>("/storage/config");
  return data;
}

/**
 * Validate a picked file before a byte leaves the browser.
 *
 * This is for the seller's benefit — an instant, plain explanation instead of a
 * failed upload after thirty seconds — and is **not** the security boundary. The
 * server re-checks the MIME type, the size and the key prefix independently,
 * because a client check is a hint, never a guarantee.
 */
export function validateImageFile(
  file: File,
  config: Pick<ImageUploadConfig, "maxBytes" | "allowedTypes">,
): string | null {
  if (!config.allowedTypes.includes(file.type)) {
    return "Use a JPEG, PNG, WebP or AVIF image.";
  }
  if (file.size <= 0) {
    return "That file is empty.";
  }
  if (file.size > config.maxBytes) {
    const mb = Math.round((config.maxBytes / (1024 * 1024)) * 10) / 10;
    return `Images must be under ${mb} MB.`;
  }
  return null;
}

function putWithProgress(
  target: UploadTarget,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Same-origin (the development sink) needs the session cookie; a real
    // provider is cross-origin and gets no credentials of ours.
    xhr.withCredentials = target.uploadUrl.startsWith("/");
    xhr.open(target.method, target.uploadUrl);
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      // The provider's own error text is not shown to the seller: it can name
      // infrastructure they cannot act on.
      reject(new Error("The upload was rejected. Please try another image."));
    });
    xhr.addEventListener("error", () =>
      reject(new Error("The upload failed. Check your connection and try again.")),
    );
    xhr.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));

    xhr.send(file);
  });
}

/** Mint a target, upload the bytes, and hand back the key and public URL. */
export async function uploadProductImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedImage> {
  const { data: target } = await api.post<UploadTarget>("/storage/upload-target", {
    contentType: file.type,
    byteSize: file.size,
  });

  await putWithProgress(target, file, onProgress);
  return { key: target.key, publicUrl: target.publicUrl };
}

/** Remove an object the caller owns. Best-effort: a listing edit is not blocked by it. */
export async function deleteProductImage(key: string): Promise<void> {
  await api.delete("/storage/object", { key });
}

/** The object key inside a stored public URL, or null when it is not ours. */
export function objectKeyFromUrl(url: string): string | null {
  const decoded = decodeURIComponent(url);
  const match = /products\/\d+\/[a-z0-9]{8,32}\.(?:jpg|png|webp|avif)/.exec(decoded);
  return match ? match[0] : null;
}
