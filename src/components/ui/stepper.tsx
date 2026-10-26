import { cn } from "@/lib/utils/cn";

export function Stepper({
  steps,
  current,
  className,
}: {
  steps: Array<{ label: string; description?: string }>;
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-3", className)} role="list">
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <li key={step.label} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-bold",
                done || active ? "bg-primary text-primary-foreground" : "bg-[var(--inset-bg)] text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              {idx + 1}
            </span>
            <div>
              <p className="font-heading text-sm font-extrabold">{step.label}</p>
              {step.description ? <p className="text-xs text-muted-foreground">{step.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
