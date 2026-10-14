import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPostAuthTarget } from "@/lib/auth/guards";
import { focusFirstInvalid } from "@/lib/utils/focus-first-invalid";
import { useRegisterMutation } from "../query";
import { AuthError } from "./AuthError";
import { PasswordField } from "./PasswordField";
import { registerSchema, registerSchemaBase, type RegisterFormValues } from "./schema";

function serverMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

/**
 * The password rules, shown while the user types.
 *
 * These are *exactly* the rules `passwordSchema` enforces — a checklist inventing
 * "one uppercase, one symbol" that the server never checked would be worse than no
 * checklist at all: the user satisfies it and registration still fails.
 */
const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "No more than 100 characters", test: (value) => value.length <= 100 },
];

function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="space-y-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.label}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Check
              size={13}
              aria-hidden
              className={met ? "text-success" : "text-muted-foreground/50"}
            />
            <span className={met ? "text-success" : undefined}>
              {rule.label}
              <span className="sr-only">{met ? " — met" : " — not met yet"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Create an account, then land on the authenticated workspace.
 *
 * Registration *is* a sign-in: the server creates the session and sets the cookies
 * before this response arrives, and the mutation has written the returned user into the
 * auth cache — so the navbar is signed in on the next render with no reload. The
 * destination is resolved through `getPostAuthTarget`, the same function the login form
 * and the route boundary use, so every entry point agrees that the home is `/dashboard`.
 *
 * `replace: true` keeps the register form out of the history stack, for the same reason
 * the login form does it.
 */
export function RegisterForm() {
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" } as RegisterFormValues,
    onSubmit: async ({ value }) => {
      setServerError(null);
      // Whole-form validation incl. the passwords-match refinement.
      const parsed = registerSchema.safeParse(value);
      if (!parsed.success) {
        setServerError(parsed.error.issues[0]?.message ?? "Please check the form.");
        return;
      }
      try {
        await registerMutation.mutateAsync({
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        });
        toast("Welcome to Revaro!");
        void navigate({ to: getPostAuthTarget(undefined), replace: true });
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
        const formEl = event.currentTarget;
        void form.handleSubmit().then(() => focusFirstInvalid(formEl));
      }}
      className="space-y-4"
      noValidate
    >
      <AuthError message={serverError} />

      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => {
            const result = registerSchemaBase.shape.name.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
          onBlur: ({ value }) => {
            const result = registerSchemaBase.shape.name.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => {
          const inputId = "register-name";
          const error = field.state.meta.errors[0];
          return (
            <div className="space-y-2">
              <label htmlFor={inputId} className="block text-sm font-bold">
                Full name
              </label>
              <Input
                id={inputId}
                autoComplete="name"
                placeholder="How neighbours will know you"
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
        name="email"
        validators={{
          onChange: ({ value }) => {
            const result = registerSchemaBase.shape.email.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
          onBlur: ({ value }) => {
            const result = registerSchemaBase.shape.email.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => {
          const inputId = "register-email";
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
            const result = registerSchemaBase.shape.password.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
          onBlur: ({ value }) => {
            const result = registerSchemaBase.shape.password.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <PasswordField
              label="Password"
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
              error={field.state.meta.errors[0]}
              disabled={form.state.isSubmitting}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <PasswordChecklist value={field.state.value} />
          </div>
        )}
      </form.Field>

      <form.Field
        name="confirmPassword"
        validators={{
          onChange: ({ value, fieldApi }) => {
            const password = fieldApi.form.getFieldValue("password") as string;
            if (value && value !== password) return "Passwords do not match";
            const result = registerSchemaBase.shape.confirmPassword.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
          onBlur: ({ value, fieldApi }) => {
            const password = fieldApi.form.getFieldValue("password") as string;
            if (value && value !== password) return "Passwords do not match";
            const result = registerSchemaBase.shape.confirmPassword.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <PasswordField
            label="Confirm password"
            value={field.state.value}
            onChange={(value) => field.handleChange(value)}
            onBlur={field.handleBlur}
            error={field.state.meta.errors[0]}
            disabled={form.state.isSubmitting}
            autoComplete="new-password"
            placeholder="Re-enter your password"
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
            {isSubmitting ? (
              "Creating your account…"
            ) : (
              <>
                <UserPlus size={15} aria-hidden />
                Create account
                <ArrowRight size={15} aria-hidden />
              </>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
