/**
 * Move keyboard focus to the first control the form marked invalid.
 *
 * ## Why this is not just styling
 *
 * When a submit fails validation, the form re-renders with `aria-invalid="true"`
 * on each offending field and an error paragraph next to it. A sighted user sees
 * the red text; a screen-reader user who is still parked on the submit button
 * hears nothing at all, and has no way to know which of five fields is wrong.
 * Panels (`role="alert"`) announce themselves, but they do not move focus, and the
 * browser does not move it either because the form was never actually submitted.
 *
 * Reading `aria-invalid` off the DOM rather than reaching into form state keeps
 * this helper independent of whichever form library is in use.
 *
 * The `requestAnimationFrame` hop lets React flush the render that *sets*
 * `aria-invalid` — querying synchronously would find the attributes from the
 * previous frame, when the field was still valid.
 */
export function focusFirstInvalid(form: HTMLFormElement | null | undefined): void {
  if (!form) return;
  const focus = () => {
    form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
  else focus();
}
