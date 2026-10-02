import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shared/product-image";
import { cn } from "@/lib/utils/cn";
import {
  deleteProductImage,
  objectKeyFromUrl,
  uploadProductImage,
  validateImageFile,
  type ImageUploadConfig,
} from "@/lib/storage";
import { REVIEW_IMAGES_MAX } from "./schema";

/**
 * Review photos.
 *
 * ## It reuses the existing storage architecture, it does not add a second one
 *
 * Uploads go through `@/lib/storage` — the same module the seller listing form
 * uses, the same `POST /api/storage/upload-target` mint, the same XHR uploader
 * with progress. Nothing here talks to a bucket directly, so a deployment that
 * moves off the development adapter moves this form with it.
 *
 * The only difference from a listing is *ownership*: a listing's images live
 * under the seller's prefix and a review's under the reviewer's, which is
 * already exactly what the storage key derives from (the authenticated user id).
 * A reviewer cannot address another person's objects because they never name
 * the key themselves.
 *
 * ## Why a failed upload never blocks the review
 *
 * The review is the important part; the photo is decoration. If the storage
 * provider is not configured in this environment, `config.available` is false
 * and the control explains that instead of failing at submit time. A shopper who
 * cannot attach a photo can still leave a review, which is the right trade.
 */
export function ReviewImages({
  images,
  onChange,
  config,
  disabled = false,
}: {
  /** Already-stored URLs. Previews are derived from these, not from File blobs. */
  images: string[];
  onChange: (images: string[]) => void;
  /** From `GET /api/storage/config`; `null` while it loads. */
  config: ImageUploadConfig | null;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const atLimit = images.length >= REVIEW_IMAGES_MAX;
  const unavailable = config !== null && !config.available;

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !config) return;
    setError(null);

    // Count the file against the cap *before* uploading it, so a picker that
    // selected six images does not upload five and then complain.
    const room = REVIEW_IMAGES_MAX - images.length;
    const batch = Array.from(files).slice(0, room);
    if (batch.length < files.length) {
      setError(`A review can carry up to ${REVIEW_IMAGES_MAX} photos.`);
    }

    setUploading(true);
    setProgress(0);
    try {
      for (const file of batch) {
        const problem = validateImageFile(file, config);
        if (problem) {
          setError(problem);
          continue;
        }
        const uploaded = await uploadProductImage(file, setProgress);
        onChange([...images, uploaded.publicUrl]);
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "That image couldn't be uploaded.",
      );
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeImage(url: string) {
    onChange(images.filter((image) => image !== url));
    // Best-effort: the object is orphaned rather than left behind, but a failed
    // delete must never stop someone removing a photo from their review.
    const key = objectKeyFromUrl(url);
    if (key) void deleteProductImage(key).catch(() => undefined);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold">Photos</p>
        <span className="text-xs text-muted-foreground">
          {images.length}/{REVIEW_IMAGES_MAX}
        </span>
      </div>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url) => (
            <li key={url} className="relative">
              <ProductImage
              src={url}
              alt=""
              className="size-20 rounded-xl border border-border/60"
            />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  aria-label="Remove this photo"
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-border transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X size={13} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {unavailable ? (
        <p className="text-xs text-muted-foreground">
          Photo uploads aren't available in this environment. You can still publish your review.
        </p>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={config?.allowedTypes.join(",")}
            multiple
            className="sr-only"
            disabled={disabled || uploading || atLimit}
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || uploading || atLimit || !config}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 size={14} aria-hidden className="animate-spin" />
                Uploading {progress}%
              </>
            ) : (
              <>
                <ImagePlus size={14} aria-hidden />
                Add photos
              </>
            )}
          </Button>
          <p className={cn("text-xs text-muted-foreground")}>
            {config?.isDevelopmentAdapter
              ? "Development storage — photos are served from this app."
              : "Up to 4 photos, 5 MB each."}
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read-only grid, used on a published review card. */
export function ReviewImageGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {images.map((url) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noreferrer noopener" className="block">
            <ProductImage
              src={url}
              alt=""
              className="size-20 rounded-xl border border-border/60 transition hover:opacity-80"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
