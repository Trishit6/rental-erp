import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(100, "Password is too long");

export const registerSchemaBase = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email").max(160),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
});

export const registerSchema = registerSchemaBase.refine(
  (data) => data.password === data.confirmPassword,
  {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  },
);

/**
 * The change-password form's per-field rules, without the cross-field refinements.
 *
 * Exported separately for the same reason `registerSchemaBase` exists: `changePasswordSchema`
 * is a `ZodEffects` once refined, and a refined schema has no `.shape` — so a field-level
 * validator cannot reach into it. Keeping the base next to the refined form means the two
 * cannot drift, while the fields can still be validated one at a time on blur.
 */
export const changePasswordSchemaBase = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your new password"),
});

/**
 * The change-password form.
 *
 * ## Why the rules are *stricter* than registration's, not the same
 *
 * Reusing `passwordSchema` on its own would let a user "change" their password to the one
 * they already have and be told everything succeeded. That is worse than no check: they
 * believe their account is now protected by something new when nothing changed at all.
 * Refusing a password equal to the current one is the only place this can be caught — the
 * client never sees the stored hash — so the rule belongs in the form and is stated plainly
 * rather than hidden behind a strength meter.
 *
 * `confirmPassword` is checked by the same refinement registration uses, so the two forms
 * cannot disagree about what "these do not match" means.
 */
export const changePasswordSchema = changePasswordSchemaBase
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password you haven't used before",
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
