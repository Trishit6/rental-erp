import { fullTimestamp } from "../format";
import type { TicketMessageRecord } from "../types";

/**
 * The ticket conversation.
 *
 * Rendered as an ordered list because a support thread is a sequence — its order is
 * meaning, and `role="list"` lets a screen reader announce how far through it is.
 * Message bodies are rendered as text, never as HTML: a customer's words are data, and
 * React escaping them is the whole defence against a pasted `<script>`.
 */
export function TicketThread({ messages }: { messages: TicketMessageRecord[] }) {
  return (
    <ol className="space-y-4" data-testid="ticket-thread">
      {messages.map((message) => (
        <li
          key={message.id}
          className={
            message.authorIsStaff ? "flex flex-col items-start" : "flex flex-col items-end"
          }
        >
          <div
            className={
              message.authorIsStaff
                ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm"
                : "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
            }
          >
            <p className="mb-1 text-xs font-semibold opacity-80">
              {message.authorIsStaff ? `${message.authorName} · Support` : message.authorName}
            </p>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            {message.attachments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block overflow-hidden rounded-lg border border-black/10"
                    >
                      <img
                        src={attachment.url}
                        alt={attachment.fileName}
                        className="h-20 w-20 object-cover"
                        loading="lazy"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <time className="mt-1 text-[11px] text-muted-foreground" dateTime={message.createdAt}>
            {fullTimestamp(message.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
