import { cn } from "@/lib/utils/cn";

export function InlineNotice({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "warning" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        variant === "warning" && "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
        variant === "info" && "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200",
        variant === "default" && "bg-[var(--inset-bg)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
