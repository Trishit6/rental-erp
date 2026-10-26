import { cn } from "@/lib/utils/cn";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded-md border border-border/70 bg-[var(--inset-bg)] px-1.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
