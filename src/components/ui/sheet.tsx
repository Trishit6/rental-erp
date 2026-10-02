import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/utils/cn";

/**
 * Bottom sheet built on Radix Dialog, so focus trapping, escape-to-close,
 * `aria-modal` and labelled titles come for free. Animated with Framer Motion.
 * Surfaces use the theme tokens, so light and dark mode both work.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
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
                  className="fixed inset-0 z-[var(--layer-overlay)] bg-black/45 backdrop-blur-[2px]"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 320 }}
                  className={cn(
                    "sheet-surface fixed inset-x-0 bottom-0 z-[var(--layer-drawer)] flex max-h-[88vh] flex-col rounded-t-[28px] outline-none",
                    className,
                  )}
                >
                  <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
                    <div>
                      <Dialog.Title className="font-heading text-lg font-extrabold">
                        {title}
                      </Dialog.Title>
                      {description && (
                        <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label={`Close ${title.toLowerCase()}`}
                        className="soft-button flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
                      >
                        <X size={16} />
                      </button>
                    </Dialog.Close>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>

                  {footer && (
                    <div className="border-t border-[var(--divider)] px-5 py-4">{footer}</div>
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
