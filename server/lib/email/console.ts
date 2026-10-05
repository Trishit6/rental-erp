import type { EmailMessage, EmailProvider } from "./types";

/**
 * The development provider: logs each message in full and keeps a bounded outbox.
 *
 * ## Why it exists separately from the no-op
 *
 * "I configured nothing" and "I turned on local mail capture" are different states
 * and a developer debugging a notification needs to tell them apart in the log. More
 * usefully, the outbox means a test can assert *which* messages a notification
 * produced — that an order confirmation sends mail and a price drop does not —
 * without a network, an SMTP server or a provider account.
 *
 * The outbox is bounded on purpose. An unbounded array in a long-running process is
 * a memory leak that looks like nothing until it doesn't; 50 is enough for a
 * developer scrolling back through a session and irrelevant anywhere else.
 */
const MAX_OUTBOX = 50;

export type ConsoleEmailProvider = EmailProvider & { readonly outbox: EmailMessage[] };

export function createConsoleEmailProvider(): ConsoleEmailProvider {
  const outbox: EmailMessage[] = [];
  return {
    name: "console",
    // Not production-ready: it prints full customer message bodies to the log, which
    // is fine on a laptop and a privacy problem on a shared host.
    isProductionReady: false,
    outbox,
    async deliver(message: EmailMessage): Promise<void> {
      console.log(
        `[email:console] to=${message.to} template=${message.template} subject=${message.subject}`,
      );
      outbox.push(message);
      if (outbox.length > MAX_OUTBOX) outbox.shift();
    },
  };
}