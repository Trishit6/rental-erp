import { useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { formatInr, rupeesToPaise } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { newPayoutIdempotencyKey } from "./schema";
import { payoutStatusLabel } from "./labels";
import {
  useDeletePayoutMethod,
  usePayoutMethods,
  useRequestPayout,
  useSavePayoutMethod,
} from "../query";
import type { WalletBalance, WalletPayout } from "../types";

/**
 * Ask to be paid out.
 *
 * ## The two hard rules on this form
 *
 * 1. **The seller never chooses a status.** There is no field, no hidden input and
 *    no query string here that could express "mark this paid". The request goes to
 *    the server as an amount, a destination and a note; whether the money ever moves
 *    is an administrator's to record, and only after they have confirmed it did.
 * 2. **The browser does not decide what is affordable.** The availability check below
 *    exists to save the seller a round trip, and its number comes from the server's
 *    own `SUM`. `requestPayout` re-reads the balance inside its transaction and
 *    locks the seller's row first, so a figure this form approved a moment ago is a
 *    *screenshot*, never a permission.
 *
 * ## One idempotency key per attempt
 *
 * The key is keyed to the *content* of the attempt — amount plus destination plus
 * note. Retrying the same attempt after a network failure reuses it, so a request
 * that actually landed does not reserve the money a second time; changing any part
 * of the attempt mints a new one, because that is genuinely a different request. The
 * server answers a reused key with the payout that already exists and
 * `created: false`, which is a retry succeeding rather than a second payout — and
 * the toast says so.
 *
 * ## Rupees in, whole paise out
 *
 * The seller types rupees, because that is what people type. The value is converted
 * once with `rupeesToPaise` — which rounds — and the **integer** is what crosses the
 * wire. No decimal ever reaches the server's `amount` column, and no rupee figure is
 * ever assembled by summing paise in the browser.
 */
export function WalletPayoutRequestForm({
  balance,
  minimumPayoutPaise,
  pendingPayouts = [],
}: {
  balance: WalletBalance | undefined;
  /** From `limits.minimumPayoutPaise`, so the floor cannot drift from enforcement. */
  minimumPayoutPaise: number;
  /** Outstanding requests, so the seller is told when money is already reserved. */
  pendingPayouts?: WalletPayout[];
}) {
  const [rupees, setRupees] = useState("");
  const [methodId, setMethodId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const { data: methods = [] } = usePayoutMethods();
  const request = useRequestPayout();

  const availablePaise = balance?.availablePaise ?? 0;

  /**
   * Default to the seller's own default, or the first saved destination.
   *
   * Computed rather than pushed into state so a newly-saved method is picked up
   * without a `useEffect` that would flash the previous selection first.
   */
  const effectiveMethodId = useMemo(() => {
    if (methodId !== null && methods.some((method) => method.id === methodId)) return methodId;
    return methods.find((method) => method.isDefault)?.id ?? methods[0]?.id ?? null;
  }, [methodId, methods]);

  const amountPaise = rupeesToPaise(parseRupees(rupees));

  const problem = validate({
    rupees,
    amountPaise,
    minimumPayoutPaise,
    availablePaise,
    methodId: effectiveMethodId,
  });

  const attempt = useRef<{ signature: string; key: string } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    if (effectiveMethodId === null) return;

    const signature = `${amountPaise}:${effectiveMethodId}:${note.trim()}`;
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { signature, key: newPayoutIdempotencyKey() };
    }

    try {
      await request.mutateAsync({
        amount: amountPaise,
        methodId: effectiveMethodId,
        ...(note.trim() ? { note: note.trim() } : {}),
        idempotencyKey: attempt.current.key,
      });

      // Only cleared on success. On failure the amount stays on screen *and* the
      // key is retained, so pressing the button again retries the same attempt
      // rather than asking for money twice.
      attempt.current = null;
      setRupees("");
      setNote("");
      setTouched(false);
    } catch {
      // The message is rendered below from `request.error`; swallowing here stops
      // an unhandled rejection escaping the event handler.
    }
  }

  const errorMessage = request.error instanceof ApiError ? request.error.message : null;

  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-extrabold">Request a payout</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInr(availablePaise)} is available to withdraw. We only mark a payout paid once an
          administrator has confirmed it left your account.
        </p>
      </div>

      {pendingPayouts.length > 0 && (
        <ul className="space-y-2">
          {pendingPayouts.map((payout) => (
            <li
              key={payout.id}
              className="inset-surface flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
            >
              <span className="font-mono text-xs">{payout.payoutNumber}</span>
              <span className="font-bold">{formatInr(payout.amount)}</span>
              <span className="text-xs text-muted-foreground">
                {payoutStatusLabel(payout.status)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs font-bold">Amount (₹)</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={rupees}
              onChange={(event) => setRupees(event.target.value)}
              placeholder={String(minimumPayoutPaise / 100)}
              aria-describedby="payout-amount-help"
              aria-invalid={touched && !!problem && isAmountProblem(rupees, minimumPayoutPaise)}
            />
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-bold">Send to</span>
            <select
              className="inset-surface h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              value={effectiveMethodId ?? ""}
              onChange={(event) => setMethodId(Number(event.target.value))}
              aria-describedby="payout-amount-help"
            >
              {methods.length === 0 && <option value="">No destination saved yet</option>}
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.maskedLabel}
                  {method.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p id="payout-amount-help" className="text-xs text-muted-foreground">
          The smallest payout is {formatInr(minimumPayoutPaise)}. Settling earnings are released
          first; reserved money cannot be requested twice.
        </p>

        <label className="block space-y-1">
          <span className="block text-xs font-bold">Note (optional)</span>
          <Textarea
            value={note}
            maxLength={200}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything that helps us find the right account"
          />
        </label>

        {touched && problem && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {problem}
          </p>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={request.isPending || !!problem}>
          {request.isPending ? "Sending request…" : "Request payout"}
        </Button>
      </form>

      <PayoutMethodsPanel />
    </Card>
  );
}

/**
 * Saved destinations.
 *
 * ## Why there is no account-number field anywhere
 *
 * There is no payout provider here, so there is nothing to tokenise a real account
 * number with — no vault, no encrypt-at-rest, no way to erase one later. So the
 * table stores only what the seller is willing to see us store: a masked label they
 * typed themselves and the account holder's name. The form reflects that rather than
 * pretending otherwise, and the field is called what it is.
 */
function PayoutMethodsPanel() {
  const { data: methods = [], isLoading } = usePayoutMethods();
  const save = useSavePayoutMethod();
  const remove = useDeletePayoutMethod();

  const [holder, setHolder] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"BANK" | "UPI">("BANK");
  const [open, setOpen] = useState(false);

  const ready = holder.trim().length >= 2 && label.trim().length >= 4;

  return (
    <div className="space-y-3 border-t border-border/60 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-base font-extrabold">Payout destinations</h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? "Cancel" : "Add a destination"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your saved destinations…</p>
      ) : methods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No destinations yet. Add one to request your first payout.
        </p>
      ) : (
        <ul className="space-y-2">
          {methods.map((method) => (
            <li
              key={method.id}
              className="inset-surface flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{method.maskedLabel}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {method.type === "BANK" ? "Bank account" : "UPI"} · {method.accountHolder}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${method.maskedLabel}`}
                disabled={remove.isPending}
                onClick={() => void remove.mutateAsync(method.id)}
              >
                <Trash2 size={15} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            void save
              .mutateAsync({
                type,
                accountHolder: holder.trim(),
                maskedLabel: label.trim(),
                isDefault: methods.length === 0,
              })
              .then(() => {
                setHolder("");
                setLabel("");
                setOpen(false);
              });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="block text-xs font-bold">Kind</span>
              <select
                className="inset-surface h-11 w-full rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                value={type}
                onChange={(event) => setType(event.target.value as "BANK" | "UPI")}
              >
                <option value="BANK">Bank account</option>
                <option value="UPI">UPI</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-bold">Account holder</span>
              <Input
                value={holder}
                maxLength={80}
                onChange={(event) => setHolder(event.target.value)}
                placeholder="As it appears on your account"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="block text-xs font-bold">Label you will recognise</span>
            <Input
              value={label}
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="HDFC Bank •••• 4321"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            Type only the masked form. Revaro does not hold full account numbers, and there is
            nothing here that would let it hold one safely.
          </p>

          <Button type="submit" size="sm" disabled={!ready || save.isPending}>
            {save.isPending ? "Saving…" : "Save destination"}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * The pre-submit check.
 *
 * Returns `null` when the form is worth sending, and a *sentence* otherwise — every
 * refusal here is also enforced server-side, so this is about not wasting the seller's
 * time, not about being the thing that stops them.
 */
function validate(input: {
  rupees: string;
  amountPaise: number;
  minimumPayoutPaise: number;
  availablePaise: number;
  methodId: number | null;
}): string | null {
  if (input.rupees.trim() === "") return "Enter an amount to withdraw.";
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    return "Enter an amount greater than zero.";
  }
  if (input.amountPaise < input.minimumPayoutPaise) {
    return `The smallest payout is ₹${input.minimumPayoutPaise / 100}.`;
  }
  if (input.amountPaise > input.availablePaise) {
    return input.availablePaise <= 0
      ? "There is no available balance to pay out yet."
      : "That is more than your available balance.";
  }
  if (input.methodId === null) return "Save a payout destination first.";
  return null;
}

/** Only flag the *amount* box, not the whole form, when the amount is the problem. */
function isAmountProblem(rupees: string, minimumPayoutPaise: number): boolean {
  const paise = rupeesToPaise(parseRupees(rupees));
  return rupees.trim() !== "" && (!Number.isFinite(paise) || paise < minimumPayoutPaise);
}

/**
 * Read a typed rupee figure.
 *
 * `Number` on a string, with the non-numeric results mapped to `NaN` rather than `0`:
 * `Number("")` is `0`, which would make an empty box look like a valid request for
 * nothing. The caller checks `rupees.trim() === ""` first, but a stray `-` or `e`
 * mid-typing still lands here and must not become a zero.
 */
function parseRupees(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "" || !/^\d*\.?\d*$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}
