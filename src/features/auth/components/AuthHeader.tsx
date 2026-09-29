import { Repeat2 } from "lucide-react";

/**
 * Reusable branding + title block for auth screens.
 * Content is configurable — no login-specific text lives here.
 */
export function AuthHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="soft-button flex size-14 items-center justify-center rounded-3xl text-primary">
        <Repeat2 size={26} />
      </span>
      <h1 className="section-title mt-5 text-3xl">{title}</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
