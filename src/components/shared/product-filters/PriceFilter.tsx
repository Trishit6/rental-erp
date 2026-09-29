import { useState } from "react";
import { IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PRICE_MAX_RUPEES } from "@/lib/product-search/schema";
import type { ListingMode } from "@/lib/product-search/types";
import { FilterClear, FilterGroup } from "./ChoiceChip";

/**
 * Parse a price input. Rejects negatives and anything non-numeric; caps at the
 * largest price the products table accepts. Returns undefined for "no bound".
 */
function parsePrice(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.floor(value), PRICE_MAX_RUPEES);
}

/**
 * Min/max price in rupees. `mode` decides which price the backend compares:
 * daily rate when renting, sale price when buying, either otherwise.
 */
export function PriceFilter({
  min,
  max,
  mode,
  onChange,
  idPrefix = "product",
}: {
  min?: number;
  max?: number;
  mode?: ListingMode;
  onChange: (min?: number, max?: number) => void;
  /** Keeps the two inputs uniquely labelled when a page renders more than one panel. */
  idPrefix?: string;
}) {
  const [minDraft, setMinDraft] = useState(min !== undefined ? String(min) : "");
  const [maxDraft, setMaxDraft] = useState(max !== undefined ? String(max) : "");

  // Adjust to an externally-changed range (URL, clear all) during render.
  const signature = `${min ?? ""}|${max ?? ""}`;
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setMinDraft(min !== undefined ? String(min) : "");
    setMaxDraft(max !== undefined ? String(max) : "");
  }

  const parsedMin = parsePrice(minDraft);
  const parsedMax = parsePrice(maxDraft);
  const reversed = parsedMin !== undefined && parsedMax !== undefined && parsedMin > parsedMax;

  function commit() {
    if (reversed) return;
    onChange(parsedMin, parsedMax);
  }

  const suffix = mode === "rent" ? "per day" : undefined;
  const hasValue = min !== undefined || max !== undefined;

  return (
    <FilterGroup
      title={suffix ? `Price (₹ ${suffix})` : "Price (₹)"}
      action={hasValue ? <FilterClear onClick={() => onChange(undefined, undefined)} /> : undefined}
    >
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <PriceInput
            id={`${idPrefix}-min-price`}
            label="Minimum price in rupees"
            placeholder="Min"
            value={minDraft}
            onChange={setMinDraft}
            onCommit={commit}
          />
          <span aria-hidden className="text-xs font-bold text-muted-foreground">
            –
          </span>
          <PriceInput
            id={`${idPrefix}-max-price`}
            label="Maximum price in rupees"
            placeholder="Max"
            value={maxDraft}
            onChange={setMaxDraft}
            onCommit={commit}
          />
        </div>
        <p
          className={cn(
            "text-[11px] font-semibold",
            reversed ? "text-destructive" : "text-muted-foreground",
          )}
          role={reversed ? "alert" : undefined}
        >
          {reversed
            ? "Minimum can't be more than the maximum."
            : suffix
              ? "Daily rate range"
              : "Leave blank for no limit"}
        </p>
      </div>
    </FilterGroup>
  );
}

function PriceInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="relative flex-1">
      <IndianRupee
        size={12}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={PRICE_MAX_RUPEES}
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        aria-invalid={false}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }
        }}
        className="inset-surface h-10 w-full rounded-full pl-7 pr-2 text-xs font-semibold text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
}
