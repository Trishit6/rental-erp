import type { EmailMessage, EmailProvider } from "./types";

/**
 * The provider used when no mail is configured.
 *
 * ## Why "unconfigured" is a provider and not an error
 *
 * `getPaymentProvider` throws a 503 when a *named* provider has no keys, because a
 * deployment that asked for Stripe and did not give it a key is broken. Email is the
 * opposite case: Revaro is fully usable with no mail at all — every notification it
 * generates also exists in-app, so email is a *second* channel rather than the only
 * one. A missing configuration must therefore degrade to "no mail is sent", never to
 * a failure that takes down the order that triggered it.
 *
 * That is what this adapter represents. It reports itself honestly —
 * `name: "none"`, and `isProductionReady: true`, because it genuinely is safe to run
 * in production; it just sends nothing — and it logs each message, so a deployment
 * that forgot to configure mail produces a readable log rather than a silent gap.
 */
export function createNoopEmailProvider(): EmailProvider {
  return {
    name: "none",
    isProductionReady: true,
    async deliver(message: EmailMessage): Promise<void> {
      console.log(
        `[email:none] no provider configured; discarded ${message.template} to=${message.to}`,
      );
    },
  };
}