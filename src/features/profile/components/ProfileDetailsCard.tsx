import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUpdateProfileMutation } from "@/features/auth/query";
import type { User } from "@/features/auth/types";
import { profileSchema } from "./schema";

/**
 * The editable part of a profile: name and phone.
 *
 * ## Why edit/confirm rather than always-editable inputs
 *
 * An always-editable form has to either save on every keystroke — a request per character
 * — or leave the user's edits sitting there next to a "Save" button that silently does
 * nothing. Here the fields are read-only until the user asks to change something, so
 * "Cancel" is meaningful and an unsaved edit can never look saved.
 *
 * Read-only rather than disabled, deliberately: a disabled input is removed from the tab
 * order and is often skipped entirely by screen readers, so the values on the page would
 * become unreadable to anyone navigating by keyboard. Read-only keeps them focusable,
 * selectable and announced.
 *
 * ## Why it resets from the *server's* answer
 *
 * On success the mutation writes the returned user into `queryKeys.auth`. The form then
 * resets to exactly those values, not to what was typed — so if the server trimmed or
 * normalised part of the input, the field shows the truth rather than a value the database
 * does not hold.
 */
export function ProfileDetailsCard({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);
  const updateProfile = useUpdateProfileMutation();

  /** The current server values, captured so Cancel has something to return to. */
  const fromServer = () => ({ name: user.name, phone: user.phone ?? "" });

  const form = useForm({
    defaultValues: fromServer(),
    onSubmit: async ({ value }) => {
      const parsed = profileSchema.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
        return;
      }
      try {
        await updateProfile.mutateAsync({ name: parsed.data.name, phone: parsed.data.phone });
        form.reset(parsed.data);
        setEditing(false);
        toast.success("Profile updated");
      } catch (error) {
        // The message comes from the server's `ApiError` and is written for a person. The
        // fallback matters for anything thrown outside that class — a router or component
        // error can carry an `Error` whose text is an internal expression, and that must
        // not end up in a toast.
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to update your profile. Please try again.",
        );
      }
    },
  });

  const isSubmitting = form.state.isSubmitting;

  function startEditing() {
    // Adopt the latest server values at the moment editing begins rather than watching for
    // them in an effect. That covers a change made on another tab or by a notification
    // without the effect's race: there is no window in which the fields show one user's
    // values and the header beside them show another's.
    form.reset(fromServer());
    setEditing(true);
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-extrabold">Your details</h2>
          <p className="text-sm text-muted-foreground">
            Your name appears on listings and messages. Your email is your sign-in and is not
            editable here.
          </p>
        </div>
        {!editing && (
          <Button type="button" variant="secondary" onClick={startEditing}>
            <Pencil size={15} aria-hidden />
            Edit details
          </Button>
        )}
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) => {
                const result = profileSchema.shape.name.safeParse(value);
                return result.success ? undefined : result.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <Field id="profile-name" label="Full name" error={field.state.meta.errors[0]}>
                <Input
                  id="profile-name"
                  autoComplete="name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  readOnly={!editing}
                  disabled={isSubmitting}
                  aria-invalid={!!field.state.meta.errors[0]}
                  aria-describedby={field.state.meta.errors[0] ? "profile-name-error" : undefined}
                />
              </Field>
            )}
          </form.Field>

          <form.Field
            name="phone"
            validators={{
              onBlur: ({ value }) => {
                const result = profileSchema.shape.phone.safeParse(value);
                return result.success ? undefined : result.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <Field
                id="profile-phone"
                label="Phone"
                hint="For delivery updates. Leave blank to remove it."
                error={field.state.meta.errors[0]}
              >
                <Input
                  id="profile-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  readOnly={!editing}
                  disabled={isSubmitting}
                  aria-invalid={!!field.state.meta.errors[0]}
                  aria-describedby={field.state.meta.errors[0] ? "profile-phone-error" : undefined}
                />
              </Field>
            )}
          </form.Field>
        </div>

        {editing && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {/*
              `isSubmitting` is TanStack Form's in-flight flag and the mutation is awaited
              inside `onSubmit`, so they cover exactly the same window. Disabling on it is
              what makes a double-submit impossible: a second click finds the button
              disabled, and a second Enter press finds the form already submitting.
            */}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={15} aria-hidden />
                  Save changes
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => {
                form.reset(fromServer());
                setEditing(false);
              }}
            >
              <X size={15} aria-hidden />
              Cancel
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

/**
 * A labelled field with room for a hint and an accessible error slot.
 *
 * The hint and the error share the slot on purpose: a field shows one or the other, and
 * giving them separate lines would make the layout jump when validation runs.
 */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}