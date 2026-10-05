import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

/**
 * The labelled form field the admin workspace's forms use.
 *
 * ## Why this is shared rather than declared per dialog
 *
 * Three dialogs (edit product, confirm, attach image) each grew their own `Field` with
 * a slightly different error treatment — one had it, one put the error above the input,
 * one omitted it. A missing `role="alert"` means a screen reader is never told the save
 * failed, so the three copies were three different accessibility bugs waiting to
 * happen. One definition, three imports.
 *
 * ## The error is `role="alert"`, not just red text
 *
 * The admin submits, the server refuses, and the first thing they need to know is
 * *which* field. Red text alone is invisible to a screen reader and invisible to anyone
 * who cannot distinguish the colour, which is exactly the person who needs it most.
 * `role="alert"` announces it, and `aria-invalid` on the control ties it to the field
 * for anyone who lands on it by tabbing.
 */

export function AdminField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  /** Permanent help text. Distinct from `error`: this is not a failure. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[11px] font-bold text-muted-foreground">
        {label}
      </label>
      {children}
      {/* The error wins the space over the hint: a field that is currently wrong should
          not also be explaining itself in softer text two pixels above the failure. */}
      {error ? (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A labelled checkbox.
 *
 * A native `<input type="checkbox">` inside a `<label>`, not a styled `div` with
 * `role="checkbox"`. The native control is keyboard-focusable, toggles on Space, and is
 * announced correctly without a single ARIA attribute — a hand-rolled version gets all
 * three wrong. The label wraps the input so the *text* is the click target too, which is
 * the part a custom control usually drops.
 */
export function AdminCheckbox({
  label,
  checked,
  onChange,
  disabled,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      {error ? (
        <p className="text-[11px] font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A URL field.
 *
 * `type="url"` so a mobile keyboard offers the scheme, with `inputMode="url"` because
 * `type="url"` alone does not. Validation still runs in the form's Zod schema rather
 * than relying on the browser's bubble: the native message is not localisable with the
 * rest of the form, and it disappears on the next render.
 */
export function AdminUrlInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      name="url"
      type="url"
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      aria-invalid={invalid ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
