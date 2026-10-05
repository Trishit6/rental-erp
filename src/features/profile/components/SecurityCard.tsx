import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Check, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { changePasswordSchema, changePasswordSchemaBase } from "@/features/auth/components/schema";
import { useChangePasswordMutation } from "@/features/auth/query";

/**
 * Change password.
 *
 * ## Why the current password is required, and asked for first
 *
 * The route already refuses a change without it, and the field is here so the user finds
 * out by reading the form rather than by being rejected by the server. It is ordered first
 * because it is the credential the user has *just* used — a change-password form that
 * asks for the new password before the current one reads as if the current one did not
 * matter.
 *
 * ## Why the form is wiped afterwards
 *
 * `form.reset(EMPTY)` runs on success only, and it empties all three fields. Leaving the
 * old password in a mounted input is the kind of thing that survives a screenshot or a
 * shared machine, and the new password has served its purpose the moment it is accepted.
 *
 * ## What the response tells the user
 *
 * The server revokes every *other* session and returns how many. That number is stated
 * explicitly, because "your password was changed" and "your password was changed and the
 * phone you were signed in on no longer is" are different things to someone whose account
 * may be under attack, and only the second one is actionable.
 */
export function SecurityCard() {
  const [changed, setChanged] = useState(false);
  const changePassword = useChangePasswordMutation();

  const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

  const form = useForm({
    defaultValues: EMPTY,
    onSubmit: async ({ value }) => {
      const parsed = changePasswordSchema.safeParse(value);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
        return;
      }
      try {
        const result = await changePassword.mutateAsync({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        });
        form.reset(EMPTY);
        setChanged(true);
        toast.success(
          result.revokedSessions > 0
            ? `Password updated. We signed out ${result.revokedSessions} other ${
                result.revokedSessions === 1 ? "session" : "sessions"
              }.`
            : "Password updated.",
        );
      } catch (error) {
        setChanged(false);
        toast.error(
          error instanceof Error ? error.message : "Unable to change your password. Try again.",
        );
      }
    },
  });

  const isSubmitting = form.state.isSubmitting;

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-extrabold">Password</h2>
          <p className="text-sm text-muted-foreground">
            Changing your password signs out your other devices.
          </p>
        </div>
        {changed && !isSubmitting && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
          >
            <Check size={14} aria-hidden />
            Password updated
          </span>
        )}
      </div>

      <form
        noValidate
        className="max-w-md space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="currentPassword"
          validators={{
            onBlur: ({ value }) => {
              const result = changePasswordSchemaBase.shape.currentPassword.safeParse(value);
              return result.success ? undefined : result.error.issues[0]?.message;
            },
          }}
        >
          {(field) => (
            <PasswordField
              label="Current password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
              disabled={isSubmitting}
              autoComplete="current-password"
              placeholder="The password you sign in with"
            />
          )}
        </form.Field>

        <form.Field
          name="newPassword"
          validators={{
            onBlur: ({ value }) => {
              const result = changePasswordSchemaBase.shape.newPassword.safeParse(value);
              return result.success ? undefined : result.error.issues[0]?.message;
            },
          }}
        >
          {(field) => (
            <PasswordField
              label="New password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
              disabled={isSubmitting}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          )}
        </form.Field>

        <form.Field
          name="confirmPassword"
          validators={{
            onBlur: ({ value }) => {
              const password = form.getFieldValue("newPassword");
              if (value && value !== password) return "Passwords do not match";
              const result = changePasswordSchemaBase.shape.confirmPassword.safeParse(value);
              return result.success ? undefined : result.error.issues[0]?.message;
            },
          }}
        >
          {(field) => (
            <PasswordField
              label="Confirm new password"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
              disabled={isSubmitting}
              autoComplete="new-password"
              placeholder="Re-enter your new password"
            />
          )}
        </form.Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden />
              Updating…
            </>
          ) : (
            <>
              <LockKeyhole size={15} aria-hidden />
              Update password
            </>
          )}
        </Button>
      </form>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
        Your password is stored as a one-way hash. Nobody — including us — can read it back,
        and it is never emailed or shown on screen.
      </p>
    </Card>
  );
}