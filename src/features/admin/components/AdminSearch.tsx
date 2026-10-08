import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { CreditCard, Handshake, Package, Search, ShoppingCart, Store, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The admin topbar search — a routing handoff, not a result engine.
 *
 * ## What it does and does not do
 *
 * It is the foundation of cross-workspace search: type a term, pick a destination
 * (or press Enter for the first suggestion) and it navigates to that module with the
 * term carried as `?q=` — `/admin/products?q=nikon`. Each module page seeds its own
 * search box from that param, so the handoff *lands* on a searching page rather than
 * a page that silently ignores the term.
 *
 * It deliberately does not build a result list across users/products/orders: that is
 * a search engine, and it does not exist yet. The honest form of a cross-module
 * search is "go to the module that owns that kind of record, already filtering",
 * because every module already searches its own table in the database.
 */

const TARGETS: { label: string; to: string; icon: LucideIcon; description: string }[] = [
  { label: "Products", to: "/admin/products", icon: Package, description: "Search the catalogue" },
  { label: "Users", to: "/admin/users", icon: Users, description: "Find an account" },
  { label: "Orders", to: "/admin/orders", icon: ShoppingCart, description: "Find a purchase" },
  { label: "Rentals", to: "/admin/rentals", icon: Handshake, description: "Find a rental booking" },
  { label: "Sellers", to: "/admin/sellers", icon: Store, description: "Find a seller" },
  { label: "Payments", to: "/admin/payments", icon: CreditCard, description: "Find a transaction" },
];

export function AdminSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = term.trim()
    ? TARGETS.filter((target) => target.label.toLowerCase().includes(term.trim().toLowerCase()))
    : TARGETS;

  // Clamp the selection during render rather than in an effect: typing narrows the
  // list, and the highlighted index must not point past its end. Deriving it keeps
  // the render a pure function of `highlighted` and `matches`.
  const maxIndex = Math.max(matches.length - 1, 0);
  const activeIndex = Math.min(highlighted, maxIndex);

  // Outside click and Escape, with focus returning to the input on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      inputRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function go(target: (typeof TARGETS)[number]) {
    setOpen(false);
    setTerm("");
    void navigate({ to: target.to, search: { q: term.trim() } });
  }

  function submit() {
    go(matches[activeIndex] ?? TARGETS[0]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted(Math.min(activeIndex + 1, maxIndex));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs" ref={containerRef}>
      <Search
        size={15}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search the workspace…"
        aria-label="Search the admin workspace"
        aria-autocomplete="list"
        aria-expanded={open}
        className="soft-button h-9 w-full rounded-full bg-muted/60 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary placeholder:text-muted-foreground/70"
      />

      {open && (
        <div
          role="listbox"
          aria-label="Search destinations"
          className="raised-surface absolute left-0 right-0 top-11 z-[var(--layer-panel)] overflow-hidden rounded-xl py-1.5"
        >
          <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Search in
          </p>
          {matches.map((target, index) => {
            const Icon = target.icon;
            const active = index === activeIndex;
            return (
              <button
                key={target.label}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => go(target)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition",
                  active ? "bg-primary/10 text-primary" : "text-foreground",
                )}
              >
                <Icon
                  size={15}
                  aria-hidden
                  className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}
                />
                <span className="font-bold">{target.label}</span>
                <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                  {target.description}
                </span>
              </button>
            );
          })}
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No matching section for “{term}”.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}