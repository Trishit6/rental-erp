import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homeFor } from "@/lib/auth/guards";
import { useRegisterMutation } from "../query";
import { AuthError } from "./AuthError";
import { PasswordField } from "./PasswordField";
import { registerSchema, registerSchemaBase, type RegisterFormValues } from "./schema";

function serverMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

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
        const user = await registerMutation.mutateAsync({
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        });
        toast("Welcome to Revaro!");
        // Registration signs the user in, exactly once: the server created the
        // session and set the cookies before this response arrived, so there is
        // no login step to repeat. The destination is the authenticated
        // workspace home (`/dashboard`) — the same page `requireGuest` sends a
        // signed-in visitor to — rather than a public page.
        void navigate({ to: homeFor(user) });
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
        name="name"
        validators={{
          onChange: ({ value }) => {
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
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
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

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Creating your account…
              </>
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
