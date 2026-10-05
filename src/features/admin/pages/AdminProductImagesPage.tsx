import { useState } from "react";
import { ImageOff, ImagePlus, Images, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { Input } from "@/components/ui/input";
import { AdminCheckbox, AdminField, AdminUrlInput } from "../components/AdminField";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminConfirmDialog, useConfirmTarget } from "../components/AdminConfirmDialog";
import { formatAdminCount } from "../components/format";
import {
  useAdminProductImageActions,
  useAdminProductImageDetail,
  useAdminProductImages,
} from "../query";
import type { AdminProductImageDetail } from "../api";

/**
 * `/admin/product-images` — a listing's photo set, in order.
 *
 * ## Why this is a separate surface rather than a tab on the catalogue
 *
 * The catalogue row is eleven columns wide and optimised for *finding* a listing. What
 * an administrator comes here to do — see a broken image, reorder a set, promote the
 * second photo to primary — is per-listing work on one record, so the list is a thin
 * picker and the actual editing happens in a drawer. Reusing the catalogue table for it
 * would have meant a twelfth column, a nested table inside a row, and two different
 * answers to "which image is primary" on two pages.
 *
 * ## Images are removed, and the confirmation says what breaks
 *
 * Removing a photo is the one destructive action here, and the primary image is the one
 * that matters: it is what Browse, search and every cart line show. So the dialog names
 * the listing, says the photo disappears everywhere, and says which image becomes
 * primary next — because "the shopfront will look different" is not a useful warning
 * and "your second photo becomes the shopfront image" is.
 */

const PAGE_SIZE = 20;

export function AdminProductImagesPage() {
  const [page, setPage] = useState(1);
  const images = useAdminProductImages(page, PAGE_SIZE);
  const [openId, setOpenId] = useState<number | null>(null);
  const confirm = useConfirmTarget<{ imageId: number; isPrimary: boolean }>();
  // A second call to the same hook: the mutation is stateless, so this is the
  // *confirm* handler's copy rather than a shared one from the drawer. Keeping the
  // removal here is what lets the dialog actually perform it — the drawer's copy is
  // used for the add/primary actions, and a confirm that closed without calling
  // anything would be a button that does nothing.
  const actions = useAdminProductImageActions();

  const rows = images.data?.rows ?? [];

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Product images"
        description="Every listing's photo set. The first image is the shopfront image and can be changed from here."
      />

      <div className="overflow-hidden rounded-2xl border border-[var(--divider)] bg-card">
        {images.isLoading && !images.data ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-xl" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : images.isError ? (
          <div className="p-4">
            <EmptyState
              icon={Images}
              title="Unable to load listings"
              description="We couldn't reach the server for this page. Please try again."
              action={
                <Button type="button" onClick={() => void images.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Images}
              title="No listings yet"
              description="Products appear here once sellers list something."
            />
          </div>
        ) : (
          <>
            <p className="border-b border-[var(--divider)] px-4 py-2.5 text-xs text-muted-foreground">
              {formatAdminCount(images.data?.total ?? 0)} listings
              {rows.length < (images.data?.total ?? 0)
                ? ` · showing ${rows.length} on this page`
                : ""}
            </p>
            <ul className="divide-y divide-[var(--divider)]">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <ProductImage
                      src={row.primaryImage}
                      alt={row.title}
                      className="size-12 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.sellerName} · {row.slug}
                      </p>
                    </div>
                    <Badge
                      className={`whitespace-nowrap ${Number(row.imageCount) === 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}
                    >
                      {formatAdminCount(row.imageCount)} image
                      {Number(row.imageCount) === 1 ? "" : "s"}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--divider)] px-4 py-3">
              <Pagination
                page={page}
                totalPages={images.data?.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      {openId !== null ? (
        <ImageDrawer
          productId={openId}
          onClose={() => setOpenId(null)}
          onRemove={(image) => confirm.request({ imageId: image.id, isPrimary: image.sortOrder === 0 })}
        />
      ) : null}

      <RemoveImageDialog
        target={confirm.target}
        isSubmitting={actions.isPending}
        onCancel={confirm.close}
        onConfirm={() => {
          if (!confirm.target) return;
          const imageId = confirm.target.imageId;
          void actions.removeImage(imageId).then(confirm.close).catch(() => {
            // The mutation already toasted the failure; closing anyway avoids leaving a
            // dialog open over a list that did not change.
            confirm.close();
          });
        }}
      />
    </div>
  );
}

/**
 * One listing's images, editable.
 *
 * A dialog rather than a sheet: it holds a handful of rows plus one form, and a modal
 * keeps the list behind it dimmed, which is what makes "pick a listing, work on it,
 * come back to the list" legible without a second navigation step.
 */
function ImageDrawer({
  productId,
  onClose,
  onRemove,
}: {
  productId: number;
  onClose: () => void;
  onRemove: (image: AdminProductImageDetail["images"][number]) => void;
}) {
  const detail = useAdminProductImageDetail(productId);
  const actions = useAdminProductImageActions();

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detail.data?.product.title ?? "Loading…"}</DialogTitle>
          <DialogDescription>
            The first image is the shopfront image shown in Browse, search and carts.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading && !detail.data ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : detail.isError ? (
          <div className="mt-4">
            <EmptyState
              icon={ImageOff}
              title="Unable to load images"
              description="We couldn't reach the server for this listing. Please try again."
              action={
                <Button type="button" onClick={() => void detail.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : (detail.data?.images.length ?? 0) === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={ImageOff}
              title="No images on this listing"
              description="It shows a placeholder everywhere until at least one image is attached."
            />
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {detail.data?.images.map((image) => (
              <li key={image.id} className="space-y-2">
                <div className="relative">
                  <ProductImage
                    src={image.url}
                    alt={image.altText ?? ""}
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  {image.sortOrder === 0 ? (
                    <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground">
                      <Star size={11} aria-hidden className="mr-1" />
                      Shopfront
                    </Badge>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  {image.sortOrder !== 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 flex-1 px-1.5 text-xs"
                      disabled={actions.isPending}
                      onClick={() => void actions.setPrimary(image.id)}
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-xs"
                    disabled={actions.isPending}
                    aria-label={`Remove image ${image.id} from ${detail.data?.product.title ?? "this listing"}`}
                    onClick={() => onRemove(image)}
                  >
                    <Trash2 size={13} aria-hidden />
                    <span className="sr-only">Remove</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <AddImageForm productId={productId} />

        <DialogFooter className="mt-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Attach a photo by URL.
 *
 * A URL field, not a file input, and that is the server's decision rather than a
 * shortcut: `POST /admin/product-images/:id` validates a URL, and the seller upload
 * flow already owns multipart handling and the storage provider. Adding a second path
 * for bytes to enter the system would mean two upload policies to keep correct.
 *
 * Validated client-side too — an unvalidated URL here renders as a broken image on the
 * shopfront and fails silently everywhere else.
 */
function AddImageForm({ productId }: { productId: number }) {
  const actions = useAdminProductImageActions();
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!isHttpUrl(trimmed)) {
      setError("Enter a full image URL starting with https://");
      return;
    }
    setError(null);
    try {
      await actions.addImage({
        productId,
        url: trimmed,
        ...(altText.trim() ? { altText: altText.trim() } : {}),
        makePrimary,
      });
      setUrl("");
      setAltText("");
      setMakePrimary(false);
    } catch {
      // The mutation already reported the failure with a toast; the field keeps its
      // value so the URL is not lost and does not have to be retyped.
    }
  };

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-[var(--divider)] pt-4">
      <h3 className="text-sm font-bold">
        <ImagePlus size={15} aria-hidden className="mr-1.5 inline align-[-2px]" />
        Attach an image
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Image URL" error={error} htmlFor="admin-image-url">
          <AdminUrlInput
            id="admin-image-url"
            placeholder="https://example.com/photo.jpg"
            value={url}
            invalid={error !== null}
            onChange={(next) => {
              setUrl(next);
              if (error) setError(null);
            }}
          />
        </AdminField>
        <AdminField
          label="Alt text"
          htmlFor="admin-image-alt"
          hint="Describes the photo for screen readers and for image search."
        >
          <Input
            id="admin-image-alt"
            name="altText"
            maxLength={200}
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
          />
        </AdminField>
      </div>
      <AdminCheckbox
        label="Make this the shopfront image"
        checked={makePrimary}
        onChange={setMakePrimary}
        disabled={actions.isPending}
      />
      <Button type="submit" size="sm" disabled={actions.isPending}>
        Attach image
      </Button>
    </form>
  );
}

/** The server accepts any URL; requiring http(s) here matches what a browser can load. */
function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * "Remove this image?", naming what the shopfront falls back to.
 *
 * The warning differs for the primary image because the consequence differs: removing
 * the shopfront image changes what every Browse card shows, while removing a later one
 * only changes what opens when someone clicks into the listing.
 */
function RemoveImageDialog({
  target,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  target: { imageId: number; isPrimary: boolean } | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!target) return null;
  return (
    <AdminConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      subject="This image will be removed from the listing."
      title="Remove this image?"
      body={
        <p>
          {target.isPrimary
            ? "It is the shopfront image, so it disappears from Browse, search results and every cart line. The next image in the set becomes the shopfront image."
            : "It disappears from the listing's gallery everywhere. Nothing else about the listing changes."}{" "}
          This cannot be undone.
        </p>
      }
      confirmLabel="Remove image"
      tone="destructive"
      isSubmitting={isSubmitting}
      onConfirm={onConfirm}
    />
  );
}
