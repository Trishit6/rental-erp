import type { LucideIcon } from "lucide-react";

export function TrustPoint({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="soft-button flex size-10 shrink-0 items-center justify-center rounded-full text-accent">
        <Icon size={17} />
      </span>
      <span>
        <span className="block text-xs font-extrabold">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}
