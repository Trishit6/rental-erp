import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canApplyCustomRange } from "./schema";
import { FILTER_CHIP_ORDER, RANGE_CHIP_ORDER } from "./labels";
import {
  WALLET_FILTER_LABELS,
  WALLET_RANGE_LABELS,
  type WalletFilter,
  type WalletParams,
  type WalletRange,
} from "../types";
import { withFilter, withRange } from "../resolve";

/**
 * The two chip rows and the custom-range fields.
 *
 * ## Both decisions are URL state, so both are `replace`d
 *
 * Changing the window is *re-reading the same page*, not travelling — the same
 * reasoning as the analytics period picker. The handler is therefore handed the
 * whole next parameter set rather than an event, and the page decides how to
 * commit it, so nothing in here knows about the router.
 *
 * ## The custom dates are committed with an explicit Apply
 *
 * A `<input type="date">` fires `change` for every segment the seller edits;
 * picking the month emits an intermediate `2026-03-01`. Committing on change would
 * fire a query for a window nobody asked for and briefly render a wallet about a
 * single day. One button, one request — the draft stays local until it is valid.
 *
 * The fields are only mounted once "Custom" is chosen, so a fixed window can never
 * be contaminated by a half-typed date left over from a previous visit.
 */
export function WalletFilters({
  params,
  onChange,
}: {
  params: WalletParams;
  onChange: (next: WalletParams) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter wallet entries">
        {FILTER_CHIP_ORDER.map((filter: WalletFilter) => (
          <Chip
            key={filter}
            label={WALLET_FILTER_LABELS[filter]}
            active={params.filter === filter}
            onClick={() => onChange(withFilter(params, filter))}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
        {RANGE_CHIP_ORDER.map((range: WalletRange) => (
          <Chip
            key={range}
            label={WALLET_RANGE_LABELS[range]}
            active={params.range === range}
            onClick={() => onChange(withRange(params, { range }))}
          />
        ))}
      </div>

      {params.range === "custom" && <CustomRange params={params} onChange={onChange} />}
    </div>
  );
}

/**
 * The custom window's two date fields.
 *
 * Re-seeded when the applied range changes from elsewhere — the Back button, or the
 * seller switching to a fixed window and back — using the render-time state
 * adjustment the analytics picker uses. Writing the same thing twice (a `useEffect`)
 * would render the stale draft for a frame first, which on a date field is visible
 * as a flicker between two different months.
 */
function CustomRange({
  params,
  onChange,
}: {
  params: WalletParams;
  onChange: (next: WalletParams) => void;
}) {
  const [draft, setDraft] = useState({ from: params.from ?? "", to: params.to ?? "" });
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const seedKey = `${params.from ?? ""}/${params.to ?? ""}`;
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft({ from: params.from ?? "", to: params.to ?? "" });
  }

  const ready = canApplyCustomRange(draft.from, draft.to);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1">
        <span className="block text-xs font-bold">From</span>
        <Input
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })}
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-bold">To</span>
        <Input
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(event) => setDraft({ ...draft, to: event.target.value })}
        />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={!ready}
        onClick={() =>
          onChange(withRange(params, { range: "custom", from: draft.from, to: draft.to }))
        }
      >
        Apply range
      </Button>
      <p className="text-xs text-muted-foreground">Both dates are read in your own timezone.</p>
    </div>
  );
}

/**
 * One chip.
 *
 * `aria-pressed` rather than `aria-current`: a chip is a toggle in a group, and it
 * stays "pressed" while the ledger under it shows the filtered result. A link that
 * highlighted itself would imply navigation, which changing a filter is not.
 */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? "primary-button text-primary-foreground" : "inset-surface"
      }`}
    >
      {label}
    </button>
  );
}
