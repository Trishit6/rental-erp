import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPostAuthTarget } from "@/lib/auth/guards";
import { focusFirstInvalid } from "@/lib/utils/focus-first-invalid";
import { useLoginMutation, useMfaChallengeMutation } from "../query";
import { AuthError } from "./AuthError";
import { PasswordField } from "./PasswordField";
import { loginSchema, mfaCodeSchema, type LoginFormValues } from "./schema";

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

/**
 * Sign in, then go where the user was actually headed.
 *
 * ## Where the destination comes from
 *
 * `redirectTo` reaches this form already resolved by `getPostAuthTarget` at the route
 * boundary, so an attacker-controlled `?redirect=` can never be a different origin. It is
 * run through the same function again here (it is idempotent) so the form is also correct
 * when it is rendered without a route — a test, or a future inline sign-in — and always
 * ends on `/dashboard` unless a guard sent the visitor somewhere real.
 *
 * `replace: true` is what stops Back from returning to the login form the user just left:
 * without it the history entry pointing at `/login` is what makes a signed-in user appear
 * signed out when they hit Back.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();
  const mfaChallenge = useMfaChallengeMutation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const form = useForm({
    defaultValues: { email: "", password: "" } as LoginFormValues,
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        const result = await loginMutation.mutateAsync({
          email: value.email,
          password: value.password,
        });
        // The password was correct but the account has a second factor: no
        // session exists yet, so the form becomes the code step. The `ticket`
        // is short-lived and can only be spent once.
        if ("mfaRequired" in result) {
          setMfaTicket(result.ticket);
          return;
        }
        toast("Welcome back!");
        // The mutation has already written the returned user into the auth cache, so
        // the navbar is signed in on the next render — this navigation is not what
        // makes the user "logged in".
        void navigate({ to: getPostAuthTarget(redirectTo), replace: true });
      } catch (error) {
        setServerError(serverMessage(error));
      }
    },
  });

  async function handleMfaSubmit() {
    if (!mfaTicket) return;
    const parsed = mfaCodeSchema.safeParse(mfaCode);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "Enter your verification code.");
      focusFirstInvalid(document.getElementById("login-mfa-form") as HTMLFormElement | null);
      return;
    }
    setServerError(null);
    try {
      await mfaChallenge.mutateAsync({ ticket: mfaTicket, code: mfaCode.trim() });
      toast("Welcome back!");
      void navigate({ to: getPostAuthTarget(redirectTo), replace: true });
    } catch (error) {
      setServerError(serverMessage(error));
    }
  }

  const submitting = form.state.isSubmitting || mfaChallenge.isPending;

  // The second step of a two-factor sign-in. The credentials stay in the form's
  // own state so "use a different account" just goes back a step.
  if (mfaTicket) {
    const mfaParsed = mfaCodeSchema.safeParse(mfaCode);
    const mfaError = mfaParsed.success ? undefined : mfaParsed.error.issues[0]?.message;

    return (
      <form
        id="login-mfa-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleMfaSubmit();
        }}
        className="space-y-4"
        noValidate
      >
        <AuthError message={serverError} />

        <div className="space-y-2">
          <label htmlFor="login-mfa-code" className="block text-sm font-bold">
            Verification code
          </label>
          <Input
            id="login-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 digits, or a recovery code"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            disabled={submitting}
            autoFocus
            aria-invalid={!!mfaError}
            aria-describedby={mfaError ? "login-mfa-code-error" : undefined}
          />
          {mfaError && (
            <p id="login-mfa-code-error" role="alert" className="text-xs font-semibold text-destructive">
              {mfaError}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
          Two-factor authentication is on for this account. Enter the code from your
          authenticator app, or one of your unused recovery codes.
        </p>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? (
            "Verifying…"
          ) : (
            <>
              <ShieldCheck size={15} aria-hidden />
              Verify and sign in
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMfaTicket(null);
            setMfaCode("");
            setServerError(null);
          }}
          className="text-center text-sm font-bold text-primary hover:underline"
        >
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const formEl = event.currentTarget;
        // If validation refuses the submit, `handleSubmit` resolves without calling
        // `onSubmit`; the rAF inside the helper then moves focus to the first field it
        // marked invalid.
        void form.handleSubmit().then(() => focusFirstInvalid(formEl));
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
          onBlur: ({ value }) => {
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
                inputMode="email"
                autoComplete="username"
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
          onBlur: ({ value }) => {
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

      <div className="text-right">
        <Link to="/forgot-password" className="text-sm font-bold text-primary hover:underline">
          Forgot your password?
        </Link>
      </div>

      {/*
        The submit button is disabled *only* while a request is in flight — not while the
        form is empty. An empty form's errors are the point: pressing the button is how a
        user discovers which field needs attention, and a permanently-disabled button
        explains nothing. Double submits are still impossible, because `isSubmitting` is
        true for exactly as long as the request is outstanding and the button blocks its
        own clicks (`aria-busy` plus `disabled`).
      */}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            {isSubmitting ? (
              "Signing in…"
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
