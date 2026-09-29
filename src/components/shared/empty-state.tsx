import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

type EmptyStateProps = {
  icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="inset-surface flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <span className="soft-button flex size-14 items-center justify-center rounded-2xl text-primary">
        <Icon size={24} />
      </span>
      <h3 className="mt-4 font-heading text-lg font-extrabold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
