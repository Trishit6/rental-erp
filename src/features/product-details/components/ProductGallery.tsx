import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ProductImage } from "../types";

/** A gallery needs something to render, even for a listing with no photos. */
const FALLBACK: ProductImage = { id: 0, url: "", altText: null };

const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 26 : -26 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction >= 0 ? -26 : 26 }),
};

function ImageFallback({ label }: { label: string }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-black/[0.03] text-muted-foreground dark:bg-white/[0.03]">
      <ImageOff size={26} aria-hidden />
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}

/**
 * Product images.
 *
 * Desktop keeps a vertical thumbnail rail beside the main image; mobile keeps the
 * thumbnails horizontal with a position counter. Arrow keys, swipe and the
 * lightbox all drive the same index, so they can't fall out of sync with it.
 */
export function ProductGallery({ images, title }: { images: ProductImage[]; title: string }) {
  const reduceMotion = useReducedMotion();
  const usable = images.filter((image) => image.url);
  const list = usable.length > 0 ? usable : [FALLBACK];

  const [[index, direction], setIndex] = useState<[number, number]>([0, 0]);
  const [broken, setBroken] = useState<number[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const draggedRef = useRef(0);

  const active = Math.min(index, list.length - 1);
  const current = list[active];
  const isBroken = broken.includes(current.id);
  const altFor = (image: ProductImage, i: number) =>
    image.altText ?? `${title} — image ${i + 1} of ${list.length}`;

  function go(next: number, dir: number) {
    const count = list.length;
    setIndex([((next % count) + count) % count, dir]);
  }

  const prev = () => go(active - 1, -1);
  const next = () => go(active + 1, 1);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {/* Vertical rail — desktop only. */}
        {list.length > 1 && (
          <div
            className="hidden max-h-[520px] w-20 shrink-0 flex-col gap-2 overflow-y-auto pr-1 lg:flex"
            role="tablist"
            aria-label="Product images"
          >
            {list.map((image, i) => (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Show image ${i + 1}`}
                onClick={() => go(i, i > active ? 1 : -1)}
                className={cn(
                  "inset-surface overflow-hidden rounded-xl p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  i === active ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
              >
                {broken.includes(image.id) ? (
                  <span className="flex size-16 items-center justify-center text-muted-foreground">
                    <ImageOff size={16} aria-hidden />
                  </span>
                ) : (
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    onError={() => setBroken((ids) => [...ids, image.id])}
                    className="size-16 rounded-lg object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}

        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Product images"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="inset-surface group relative min-w-0 flex-1 rounded-[28px] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="relative overflow-hidden rounded-[22px]">
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={current.id}
                custom={direction}
                variants={slideVariants}
                initial={reduceMotion ? false : "enter"}
                animate="center"
                exit={reduceMotion ? undefined : "exit"}
                transition={{ duration: 0.24, ease: "easeOut" }}
                drag={list.length > 1 && !reduceMotion ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.14}
                onDragStart={() => {
                  draggedRef.current = 0;
                }}
                onDragEnd={(_, info) => {
                  draggedRef.current = Math.abs(info.offset.x);
                  if (info.offset.x < -60) next();
                  else if (info.offset.x > 60) prev();
                }}
                className="bg-black/[0.03] dark:bg-white/[0.03]"
              >
                {isBroken || !current.url ? (
                  <ImageFallback label="Image unavailable" />
                ) : (
                  <img
                    src={current.url}
                    alt={altFor(current, active)}
                    onError={() => setBroken((ids) => [...ids, current.id])}
                    draggable={false}
                    className="aspect-[4/3] w-full object-cover"
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {current.url && !isBroken && (
              <button
                type="button"
                aria-label="Open full-size image"
                onClick={() => {
                  if (draggedRef.current < 8) setLightboxOpen(true);
                }}
                className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100 max-lg:opacity-100"
              >
                <Maximize2 size={15} aria-hidden />
              </button>
            )}

            {list.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={prev}
                  className="absolute left-2.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronLeft size={17} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={next}
                  className="absolute right-2.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronRight size={17} aria-hidden />
                </button>
                <span className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-bold tabular-nums shadow-sm">
                  {active + 1} / {list.length}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal thumbnails — tablet and below. */}
      {list.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1 lg:hidden"
          role="tablist"
          aria-label="Product images"
        >
          {list.map((image, i) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Show image ${i + 1}`}
              onClick={() => go(i, i > active ? 1 : -1)}
              className={cn(
                "inset-surface shrink-0 overflow-hidden rounded-xl p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                i === active ? "ring-2 ring-primary" : "opacity-70",
              )}
            >
              {broken.includes(image.id) ? (
                <span className="flex size-14 items-center justify-center text-muted-foreground">
                  <ImageOff size={15} aria-hidden />
                </span>
              ) : (
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  onError={() => setBroken((ids) => [...ids, image.id])}
                  className="size-14 rounded-lg object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      <ImageViewer
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        list={list}
        active={active}
        onPrev={prev}
        onNext={next}
        altFor={altFor}
      />
    </div>
  );
}

/** Full-screen viewer. Radix supplies the focus trap, Escape and `aria-modal`. */
function ImageViewer({
  open,
  onOpenChange,
  list,
  active,
  onPrev,
  onNext,
  altFor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ProductImage[];
  active: number;
  onPrev: () => void;
  onNext: () => void;
  altFor: (image: ProductImage, index: number) => string;
}) {
  const reduceMotion = useReducedMotion();
  const current = list[active];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm"
                />
              </Dialog.Overlay>
              <Dialog.Content
                asChild
                forceMount
                aria-describedby={undefined}
                onKeyDown={(event: React.KeyboardEvent) => {
                  if (event.key === "ArrowLeft") onPrev();
                  if (event.key === "ArrowRight") onNext();
                }}
              >
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed inset-0 z-[90] flex items-center justify-center p-4 outline-none"
                >
                  <Dialog.Title className="sr-only">Product image viewer</Dialog.Title>

                  <img
                    src={current.url}
                    alt={altFor(current, active)}
                    className="max-h-[86vh] max-w-full rounded-2xl object-contain"
                  />

                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close image viewer"
                      className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </Dialog.Close>

                  {list.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous image"
                        onClick={onPrev}
                        className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <ChevronLeft size={20} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Next image"
                        onClick={onNext}
                        className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        <ChevronRight size={20} aria-hidden />
                      </button>
                      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums text-white backdrop-blur">
                        {active + 1} / {list.length}
                      </p>
                    </>
                  )}
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
