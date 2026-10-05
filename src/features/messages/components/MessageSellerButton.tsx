import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMessageSellerGate, useStartConversation } from "../query";
import { draftProblem, MESSAGE_MAX_LENGTH } from "./schema";

/**
 * "Message seller" — the feature's only entry point.
 *
 * ## Why it lives here and not on the product page
 *
 * The product page used to describe a "Message seller" affordance in its copy and had a
 * dead `contactProductSeller` in its `api.ts` that nothing called. The button belongs to
 * the messaging feature because everything it needs belongs to the messaging feature —
 * the mutation, the composer rule, the decision about who may be offered a thread, and
 * the navigation to it — so putting it in `features/product-details` would mean that
 * page importing another feature's *data* layer to render it. It renders here and the
 * product page imports a component, which is the same direction every other
 * cross-feature reuse in this app takes (`ReviewSection`, `FavoriteControl`,
 * `CategoryIcon`).
 *
 * ## Why the dialog asks for the message text
 *
 * `POST /api/conversations` requires a non-empty first message. Sending an empty thread
 * would produce a conversation that looks broken on both sides and teaches the user that
 * "message" means "open a chat window" — so the text is collected before the thread
 * exists, which also means the server is never asked to accept an empty body.
 *
 * The alternative — navigate to `/messages` and compose there — loses the listing. The
 * thread would be opened by a page with no product in context, which is exactly the case
 * `assertCanContactSeller` exists to refuse.
 *
 * ## Hooks first, branches after
 *
 * Every hook runs before any early return. The guest and own-listing cases return early
 * because they render *something else entirely*, and a conditional hook would mean a
 * signed-out visitor took a different hook order from a signed-in one — which React does
 * not allow, and which fails as a confusing render error rather than as the obvious
 * "too few hooks" it is.
 */
export function MessageSellerButton({
  productId,
  sellerName,
  sellerId,
  className,
}: {
  productId: number;
  sellerName: string;
  sellerId: number;
  className?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const gate = useMessageSellerGate(sellerId);
  const start = useStartConversation();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // `useStartConversation` already toasts both outcomes in the server's own wording, so
  // this handler adds no error of its own — it only decides where to go afterwards.
  const problem = draftProblem(draft, start.isPending);

  async function handleSend() {
    if (problem) return;
    try {
      const started = await start.mutateAsync({ productId, body: draft.trim() });
      setOpen(false);
      setDraft("");
      // Straight into the thread that now exists. Without this the user is told
      // "message sent" while left staring at the listing they asked from, with no way to
      // see the conversation they just opened.
      await navigate({ to: "/messages", search: { conversation: started.conversationId } });
    } catch {
      // The draft is deliberately left in the box. A message the user typed and lost is
      // worse than any error message — they would have to reconstruct it — and the
      // mutation has already raised the server's reason as a toast.
    }
  }

  // Signed out: the affordance is still worth showing, but it has to lead to the login
  // page rather than to a dialog that cannot succeed. `href` rather than `pathname` so
  // the listing — and any query state on it — is where the user lands afterwards.
  if (gate.isGuest) {
    return (
      <Button asChild variant="secondary" size="sm" className={className}>
        <Link to="/login" search={{ redirect: location.href }}>
          <MessageCircle size={14} aria-hidden />
          Sign in to message
        </Link>
      </Button>
    );
  }

  // Your own listing. `POST /api/conversations` answers 400 "You cannot message
  // yourself", so the button is hidden rather than shown and then refused.
  if (gate.isOwnListing) return null;

  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
        <MessageCircle size={14} aria-hidden />
        Message seller
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {sellerName}</DialogTitle>
            <DialogDescription>
              Ask about condition, availability or delivery. Your message and the
              seller&apos;s reply stay in your messages.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            className="mt-4"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={5}
            autoFocus
            aria-label={`Message to ${sellerName}`}
            placeholder="Hi, is this still available?"
          />

          {problem && !start.isPending && (
            <p className="mt-2 text-xs font-semibold text-muted-foreground" aria-live="polite">
              {problem}
            </p>
          )}

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={start.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void handleSend()} disabled={Boolean(problem)}>
              {start.isPending ? "Sending…" : "Send message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
