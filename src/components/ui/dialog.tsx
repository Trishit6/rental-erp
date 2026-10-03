import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils/cn";

/**
 * Modal dialog on Radix Dialog, so focus trapping, escape-to-close, `aria-modal`
 * and a labelled title come for free — the same reasoning as `sheet.tsx`, which
 * is the bottom-sheet variant of this primitive.
 *
 * Surfaces use the theme tokens (`--color-background`, `--divider`,
 * `--shadow-color-dark`) and the neumorphic edges the rest of Revaro uses, so
 * light and dark mode both work. Consumers animate the *content* with Framer
 * Motion (see `OrderActionsPanel`); this file stays presentational so the
 * animation choice belongs to the caller.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--layer-overlay)] bg-black/45 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "modal-surface fixed left-1/2 top-1/2 z-[var(--layer-modal)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-5 outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="soft-button absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary"
          aria-label="Close dialog"
        >
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { children?: ReactNode }) {
  return <div className={cn("space-y-1 pr-10 text-left", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { children?: ReactNode }) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-heading text-lg font-extrabold text-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
