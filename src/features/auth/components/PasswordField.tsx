import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Shared password field with accessible show/hide toggle.
 * Used by both login and registration — do not duplicate visibility logic.
 *
 * ## The three states this field carries
 *
 *  - **Visibility.** The toggle is a real `aria-pressed` button, so a screen
 *    reader announces "Show password, toggle button, not pressed" and hears the
 *    state change on activation — the label alone would only ever say the action.
 *  - **Caps Lock.** Typing a password with Caps Lock on is the most common
 *    "my password is wrong" that isn't. `getModifierState` reports it on every
 *    keystroke, so the hint appears the moment a capital letter would be a
 *    surprise, and clears on blur.
 *  - **Error.** Announced via `role="alert"` and wired to the input with
 *    `aria-describedby`, so the message is read as part of the field.
 */
export function PasswordField({
  label,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  placeholder,
  autoComplete = "current-password",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const capsId = `${inputId}-caps`;

  const describedBy =
    [error ? errorId : null, capsLock ? capsId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            setCapsLock(false);
            onBlur();
          }}
          onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
          onKeyDown={(event) => {
            if (event.key === "CapsLock") setCapsLock(event.getModifierState("CapsLock"));
          }}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-12"
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
      {capsLock && (
        <p id={capsId} role="status" className="text-xs font-semibold text-muted-foreground">
          Caps Lock is on.
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
