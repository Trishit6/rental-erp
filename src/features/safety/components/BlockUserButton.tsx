import { Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBlockUser, useIsBlocked, useUnblockUser } from "../query";

/**
 * A block/unblock toggle for one account, sized for a thread header.
 *
 * ## Why it reads the list instead of receiving a `isBlocked` prop
 *
 * The conversation payload does not carry a block flag, and it should not: a block
 * is mutual on the server, so a flag per counterparty would leak *why* the pair
 * cannot talk and would go stale the moment the other page changed it. Deriving the
 * state from the one cached list means the header, `/settings` and any future
 * surface flip together on the same invalidation.
 */
export function BlockUserButton({
  userId,
  name,
  className,
}: {
  userId: number;
  name: string;
  className?: string;
}) {
  const isBlocked = useIsBlocked(userId);
  const block = useBlockUser();
  const unblock = useUnblockUser();
  const isPending = block.isPending || unblock.isPending;

  if (isBlocked) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={className}
        disabled={isPending}
        onClick={() => unblock.mutate(userId)}
        aria-label={`Unblock ${name}`}
        data-testid="unblock-user-button"
      >
        <ShieldCheck size={13} aria-hidden />
        Unblock
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={isPending}
      onClick={() => block.mutate({ userId })}
      aria-label={`Block ${name}`}
      data-testid="block-user-button"
    >
      <Ban size={13} aria-hidden />
      Block
    </Button>
  );
}
