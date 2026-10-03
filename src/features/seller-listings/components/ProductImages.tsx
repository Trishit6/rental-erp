import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/shared/product-image";
import {
  deleteProductImage,
  objectKeyFromUrl,
  uploadProductImage,
  validateImageFile,
  type ImageUploadConfig,
} from "@/lib/storage";
import { PRODUCT_IMAGES_MAX } from "./schema";

/**
 * A listing's photos: upload, remove, reorder, and choose the cover.
 *
 * ## It reuses the existing storage architecture, it does not add a second one
 *
 * Uploads go through `@/lib/storage` — the same `POST /api/storage/upload-target`
 * mint and the same XHR uploader with progress that review photos use. Nothing
 * here talks to a bucket directly, so a deployment that moves off the
 * development adapter moves this form with it.
 *
 * The seller's *previous* create form had no upload at all: it asked for pasted
 * image URLs. That is what made the server's `allowedImageHosts` check so
 * important — a pasted URL could point anywhere on the internet, and a product
 * page is a page every visitor of that listing loads.
 *
 * ## Order is the cover
 *
 * There is no separate "primary image" column. `product_images.sort_order` *is*
 * the ordering, and index 0 is the cover, so moving a photo to the front is a
 * reorder rather than a flag. One ordering means one answer to "which image is
 * the cover" for the product page, the listings table and the cart alike.
 *
 * ## Removing an image is best-effort
 *
 * `onChange` runs first and the object delete second, and a failed delete is
 * swallowed. The alternative — blocking the removal on the storage call — means a
 * storage outage makes a seller unable to fix their own listing, leaving them
 * stuck with a photo they have already decided against. The orphaned object costs
 * a few kilobytes; the stuck form costs a sale.
 */
export function ProductImages({
  images,
  onChange,
  config,
  disabled = false,
}: {
  /** Stored URLs, in display order. Index 0 is the cover. */
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

  const atLimit = images.length >= PRODUCT_IMAGES_MAX;
  const unavailable = config !== null && !config.available;
  const room = PRODUCT_IMAGES_MAX - images.length;

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !config) return;
    setError(null);

    // Trim against the cap *before* uploading, so a picker that selected twelve
    // images does not upload eight and then complain about the rest.
    const batch = Array.from(files).slice(0, room);
    if (batch.length < files.length) {
      setError(`A listing can carry up to ${PRODUCT_IMAGES_MAX} images.`);
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
    // Only objects this deployment stored are removable: a seeded Unsplash URL
    // has no key here, and asking the API to delete one would just be a 404.
    const key = objectKeyFromUrl(url);
    if (key) void deleteProductImage(key).catch(() => undefined);
  }

  /** Move a photo by `offset` places, clamped to the ends of the list. */
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-bold">Photos</p>
        <span className="text-xs text-muted-foreground">
          {images.length}/{PRODUCT_IMAGES_MAX}
        </span>
        <span className="text-xs text-muted-foreground">
          The first photo is the cover. Drag order with the arrows.
        </span>
      </div>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, index) => (
            <li key={url} className="relative">
              <ProductImage
                src={url}
                alt={index === 0 ? "Cover photo" : `Photo ${index + 1}`}
                className="size-24 rounded-xl border border-border/60"
              />
              {index === 0 && (
                <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  <Star size={9} aria-hidden />
                  Cover
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-border transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X size={13} aria-hidden />
                </button>
              )}
              {!disabled && images.length > 1 && (
                <div className="absolute bottom-1 right-1 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                    className="flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border transition hover:bg-background disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronLeft size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                    className="flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border transition hover:bg-background disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight size={13} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {unavailable ? (
        <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Photo uploads aren't available in this environment, so you can only add images by address.
          Your listing can still be saved without photos.
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
          <div className="flex flex-wrap items-center gap-2">
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
            {atLimit && <p className="text-xs text-muted-foreground">That's the maximum.</p>}
          </div>
          {config?.isDevelopmentAdapter && (
            <p className="text-xs text-muted-foreground">
              Development storage — photos are served from this app.
            </p>
          )}
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
