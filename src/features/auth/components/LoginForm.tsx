import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homeFor } from "@/lib/auth/guards";
import { useLoginMutation } from "../query";
import { AuthError } from "./AuthError";
import { PasswordField } from "./PasswordField";
import { loginSchema, type LoginFormValues } from "./schema";

/**
 * Turn a failed request into something a person can act on.
 *
 * The `ApiError` message is already user-facing by construction — the server sends a
 * written message like "Email or password is incorrect", never a driver or stack string —
 * so it is used as-is. The `instanceof` guard is the part that matters: an error thrown
 * from anywhere *else* (a router, a component) can be an `Error` whose `message` is
 * something like "Cannot read properties of undefined", and pasting that into a form is
 * how internal detail reaches a user.
 */
function serverMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" } as LoginFormValues,
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        const user = await loginMutation.mutateAsync({
          email: value.email,
          password: value.password,
        });
        toast("Welcome back!");
        // `redirectTo` is the page the visitor was originally refused, already sanitised
        // at the route boundary. Without one, the destination is the authenticated
        // workspace home (`/dashboard`) — the same page `requireGuest` sends a
        // signed-in visitor to, so the two never disagree about where a user belongs.
        void navigate({ to: redirectTo ?? homeFor(user) });
      } catch (error) {
        setServerError(serverMessage(error));
      }
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4"
      noValidate
    >
      <AuthError message={serverError} />

      <form.Field
        name="email"
        validators={{
          onChange: ({ value }) => {
            const result = loginSchema.shape.email.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => {
          const inputId = `login-email-${field.name}`;
          const error = field.state.meta.errors[0];
          return (
            <div className="space-y-2">
              <label htmlFor={inputId} className="block text-sm font-bold">
                Email
              </label>
              <Input
                id={inputId}
                type="email"
                autoComplete="email"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={form.state.isSubmitting}
                aria-invalid={!!error}
                aria-describedby={error ? `${inputId}-error` : undefined}
              />
              {error && (
                <p
                  id={`${inputId}-error`}
                  role="alert"
                  className="text-xs font-semibold text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onChange: ({ value }) => {
            const result = loginSchema.shape.password.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <PasswordField
            label="Password"
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            onBlur={field.handleBlur}
            error={field.state.meta.errors[0]}
            disabled={form.state.isSubmitting}
          />
        )}
      </form.Field>

      {/*
        `isSubmitting` is TanStack Form's own in-flight flag, and the mutation is only
        awaited inside `onSubmit`, so the two agree: the button disables for exactly as
        long as the request is outstanding. That is what makes a double-submit impossible —
        a second click finds the button disabled and a second Enter press finds
        `canSubmit` false.
      */}
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              <>
                <LogIn size={15} aria-hidden />
                Sign in
                <ArrowRight size={15} aria-hidden />
              </>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
