import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

/**
 * Multi-line text input, on the same `inset-surface` token and focus ring as
 * `input.tsx` so a form mixing the two reads as one control set in both light
 * and dark mode.
 *
 * `min-h` is set rather than a fixed height: a review body grows with what is
 * written instead of scrolling inside a box that never gets taller.
 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "inset-surface min-h-24 w-full resize-y rounded-2xl px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
