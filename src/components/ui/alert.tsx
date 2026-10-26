import { cn } from "@/lib/utils/cn";

export function Alert({
  children,
  className,
  variant = "default",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "destructive" | "success";
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        variant === "destructive" && "border-destructive/40 text-destructive",
        variant === "success" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
        variant === "default" && "border-border/70",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Callout({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Alert className={className}>{children}</Alert>;
}
