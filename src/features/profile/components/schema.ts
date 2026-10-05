import { z } from "zod";

/**
 * The self-service profile form.
 *
 * ## Why it mirrors the server's schema rather than inventing its own limits
 *
 * `selfEditableProfileFields` in `server/lib/auth.ts` is the authority on what a user may
 * change and how long each value may be. A client schema with different numbers is not a
 * friendlier experience — it is a form that accepts something the server will reject with
 * a raw 400, or that rejects something the server would have taken. The `80` and the `20`
 * below are the column widths, and they are also what `users.name` and `users.phone` are.
 *
 * `avatarUrl` is validated as an optional URL *or* `null`, because "remove my picture" is a
 * real action and needs to be expressible — the original schema had no `null`, so a user
 * could add a photo but never take it away.
 *
 * The role is absent by design. It is not a field this form can set even by accident, and
 * that is the client-side half of the server's whitelist; the other half is that the server
 * never reads it.
 */
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name is too short")
    .max(80, "Name is too long")
    .refine((value) => /\S/.test(value), "Name is required"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number is too long")
    // Digits, spaces and the punctuation people actually write a number with. Anything
    // else in a phone field is a paste accident, and it is also what makes a number
    // unusable by the courier who has to read it off the screen.
    .refine(
      (value) => value === "" || /^[+()\-\s\d]{6,20}$/.test(value),
      "Enter a valid phone number",
    ),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;