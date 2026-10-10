import { Link, useSearch } from "@tanstack/react-router";
import { Check, Loader2, MailCheck, RotateCcw } from "lucide-react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "./components/AuthCard";
import { AuthError } from "./components/AuthError";
import { AuthHeader } from "./components/AuthHeader";
import { LoginForm } from "./components/LoginForm";
import { PasswordField } from "./components/PasswordField";
import { RegisterForm } from "./components/RegisterForm";
import { passwordSchema } from "./components/schema";
import { useForgotPasswordMutation, useResetPasswordMutation } from "./query";

export function LoginPage({ redirectTo }: { redirectTo?: string }) {
  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Welcome back"
        description="Sign in to rent, buy and share with your neighbours."
      />

      <div className="mt-7 w-full">
        <AuthCard>
          <LoginForm redirectTo={redirectTo} />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            New to Revaro?{" "}
            <Link to="/register" className="font-bold text-primary hover:underline">
              Create an account
            </Link>
          </p>
          {/*
           * The password is deliberately absent.
           *
           * It used to be printed here, which put a credential in client code and in
           * every production bundle — and made this hint *wrong* the moment the
           * admin password was set from the environment. The seeded credentials now
           * live only in `server/lib/config.ts`; the seed script prints them to the
           * terminal that ran it, which is the only place a local demo password
           * needs to be visible.
           *
           * `import.meta.env.DEV` is replaced with `false` and this branch is
           * tree-shaken out of a production build, so a deployed marketplace does
           * not advertise which local accounts exist either.
           */}
          {import.meta.env.DEV ? (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Local demo accounts: buyer@revaro.local · seller@revaro.local · admin@revaro.local
              <br />
              The password is printed by <code>pnpm db:seed</code>.
            </p>
          ) : null}
        </AuthCard>
      </div>
    </div>
  );
}

export function RegisterPage() {
  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Create your Revaro account"
        description="One account to rent, buy, sell — and share good things."
      />

      <div className="mt-7 w-full">
        <AuthCard>
          <RegisterForm />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </AuthCard>
      </div>
    </div>
  );
}

/**
 * `/forgot-password` — ask for a reset link.
 *
 * The endpoint answers `{ sent: true }` for *every* address (its no-enumeration
 * rule), so this page's success state repeats the same generic sentence to
 * everyone. That sameness is the security property: a visitor who mistypes an
 * address gets no extra information either.
 */
export function ForgotPasswordPage() {
  const forgot = useForgotPasswordMutation();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await forgot.mutateAsync({ email: value.email.trim() });
        setSent(true);
      } catch (error) {
        setServerError(error instanceof Error ? error.message : "Please try again.");
      }
    },
  });

  if (sent) {
    return (
      <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
        <AuthHeader
          title="Check your inbox"
          description="If an account exists for that address, a reset link is on its way."
        />
        <div className="mt-7 w-full">
          <AuthCard>
            <div className="space-y-4 text-center">
              <MailCheck size={32} className="mx-auto text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                The link expires in an hour and can be used once. No email? Check your spam
                folder, then try again.
              </p>
              <Link to="/login" className="block text-sm font-bold text-primary hover:underline">
                Back to sign in
              </Link>
            </div>
          </AuthCard>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Reset your password"
        description="Tell us the email on your account and we'll send a one-time link."
      />

      <div className="mt-7 w-full">
        <AuthCard>
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
                  if (!value.trim()) return "Email is required";
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Enter a valid email";
                  return undefined;
                },
              }}
            >
              {(field) => {
                const inputId = `forgot-email-${field.name}`;
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
                      <p id={`${inputId}-error`} role="alert" className="text-xs font-semibold text-destructive">
                        {error}
                      </p>
                    )}
                  </div>
                );
              }}
            </form.Field>

            <Button type="submit" size="lg" className="w-full" disabled={form.state.isSubmitting}>
              {form.state.isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  <RotateCcw size={15} aria-hidden />
                  Send reset link
                </>
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="font-bold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}

/**
 * `/reset-password?token=…` — spend the emailed link.
 *
 * The token arrives in the URL, so a visitor with no token gets a plain
 * "link is incomplete" state instead of a form that would only fail.
 */
export function ResetPasswordPage() {
  const { token } = useSearch({ from: "/_auth/reset-password" });
  const reset = useResetPasswordMutation();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const EMPTY = { newPassword: "", confirmPassword: "" };

  const form = useForm({
    defaultValues: EMPTY,
    onSubmit: async ({ value }) => {
      setServerError(null);
      if (!token) {
        setServerError("This reset link is incomplete. Request a new one.");
        return;
      }
      if (value.newPassword !== value.confirmPassword) {
        setServerError("Passwords do not match.");
        return;
      }
      try {
        await reset.mutateAsync({ token, newPassword: value.newPassword });
        setDone(true);
        toast.success("Your password has been reset. Sign in with the new one.");
      } catch (error) {
        setServerError(error instanceof Error ? error.message : "Please try again.");
      }
    },
  });

  if (!token) {
    return (
      <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
        <AuthHeader title="Link incomplete" description="This reset link is missing its token." />
        <div className="mt-7 w-full">
          <AuthCard>
            <p className="text-sm text-muted-foreground">
              Request a fresh link from{" "}
              <Link to="/forgot-password" className="font-bold text-primary hover:underline">
                the reset page
              </Link>
              .
            </p>
          </AuthCard>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
        <AuthHeader title="Password updated" description="All of your sessions were signed out." />
        <div className="mt-7 w-full">
          <AuthCard>
            <div className="space-y-4 text-center">
              <Check size={32} className="mx-auto text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Sign in with your new password. Other devices are signed out.
              </p>
              <Link to="/login" className="block text-sm font-bold text-primary hover:underline">
                Go to sign in
              </Link>
            </div>
          </AuthCard>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap flex max-w-md flex-col items-center pb-16 pt-10 sm:pt-14">
      <AuthHeader
        title="Choose a new password"
        description="Use at least 8 characters, and don't reuse the shared demo one."
      />

      <div className="mt-7 w-full">
        <AuthCard>
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
              name="newPassword"
              validators={{
                onBlur: ({ value }) => {
                  const result = passwordSchema.safeParse(value);
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
                  disabled={form.state.isSubmitting}
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
                  if (!value) return "Confirm your new password";
                  return undefined;
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
                  disabled={form.state.isSubmitting}
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                />
              )}
            </form.Field>

            <Button type="submit" size="lg" className="w-full" disabled={form.state.isSubmitting}>
              {form.state.isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                <>
                  <RotateCcw size={15} aria-hidden />
                  Set new password
                </>
              )}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
