import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  primaryAction,
  secondaryActions,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryActions?: Array<{ label: string; href?: string; onClick?: () => void }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((b, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {b.href && !last ? <Link to={b.href}>{b.label}</Link> : <span className={cn(last && "text-foreground")}>{b.label}</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions?.map((a, i) =>
            a.href ? (
              <Button key={i} variant="ghost" size="sm" asChild>
                <Link to={a.href}>{a.label}</Link>
              </Button>
            ) : (
              <Button key={i} variant="ghost" size="sm" onClick={a.onClick}>
                {a.label}
              </Button>
            ),
          )}
          {primaryAction ? (
            primaryAction.href ? (
              <Button asChild size="sm">
                <Link to={primaryAction.href}>{primaryAction.label}</Link>
              </Button>
            ) : (
              <Button size="sm" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
