import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, Flame, Loader2, Package, Search, Tag, Trees, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import {
  flattenOptions,
  isSearchBoxOpen,
  searchBoxReducer,
  SEARCH_MIN_DRAFT_LENGTH,
  type SearchBoxState,
  type SearchRecent,
  type SuggestedProduct,
} from "./search-state";
import { Highlight } from "./highlight";
import {
  recordSearchTerm,
  removeSearchRecent,
  useSearchSuggestions,
  useSearchSurface,
} from "./use-search-suggestions";

/**
 * The ONE search box (PROMPT R11) — one surface, one border, one data path.
 *
 * ## Why the field is a bare `<input>` and not the shared `Input`
 *
 * `Input` always carries `.inset-surface`, which is authored *outside* Tailwind's
 * cascade layers; on a field sitting inside this component's surface bar that
 * reads as a second field nested in the first. A bare input takes utilities
 * normally, so the bar is the only surface (the same lesson `HeroSearch`
 * recorded, and the reason `product-filters/SearchBar.tsx` does this too).
 *
 * ## The keyboard map is table-driven against `flattenOptions`
 *
 * Arrow / Home / End / Enter operate on one flat option list, so each key is
 * one loop over one array. The visible groups (Products, Categories, Brands)
 * are presentation; their row indices are offsets into that same list, so
 * pointer hover and keyboard never disagree about which row is active.
 *
 * ## `/` ownership
 *
 * Every visible bar variant listens for `/`, and exactly one claims it: the
 * hero while it is on screen, the navbar otherwise — decided from the hero
 * element's bounding rect, not another observer subscription. A module-level
 * latch makes double-mounting harmless. An overlay input is an editable
 * target, so the same listener never hijacks typing into it.
 */

export type SearchBoxVariant = "navbar" | "hero" | "overlay";

export type SearchBoxProps = {
  variant: SearchBoxVariant;
  autoFocus?: boolean;
  /** Overlay: called by backdrop, Escape, and any navigation out of the overlay. */
  onClose?: () => void;
};

/* ------------------------------ '/' ownership -------------------------------- */

let lastSlashHandledAt = 0;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Is `#hero-search` intersecting the viewport right now (rect check, no observer). */
export function isHeroSearchOnScreen(): boolean {
  const hero = document.getElementById("hero-search");
  if (!hero) return false;
  const rect = hero.getBoundingClientRect();
  return rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

/* ---------------------------- controller (shared) ---------------------------- */

type ControllerOptions = {
  variant: SearchBoxVariant;
  overlay: boolean;
  /** Overlay hosts close it on Escape / navigation. */
  onClose?: () => void;
};

/**
 * Authority over draft, state machine, options, keyboard and navigation —
 * shared by the three variants so they cannot grow three nav models.
 */
function useSearchBoxController({ variant, overlay, onClose }: ControllerOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // A focus event on an already-open box must not wipe a result set —
  // re-focus happens on Tab dances and pointer clicks on the input.
  const [draft, setDraft] = useState("");
  const [state, dispatch] = useReducer(searchBoxReducer, { status: "idle" } as SearchBoxState);
  const { surface } = useSearchSurface(true);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { payload, isFetching, isError, retry } = useSearchSuggestions(draft, isSearchBoxOpen(state));
  const open = isSearchBoxOpen(state);
  const options = open ? flattenOptions(state) : [];
  const activeOption = options[activeIndex];

  // A surface refresh (history write, removal) must reach an already-open
  // empty panel, not just the next focus. `refreshSurface` updates the payload
  // alone; a closed box ignores it, and an open results list is rebuilt from
  // its own machine state on the next render cycle.
  const beforeShow = state.status === "focusedEmpty";
  useEffect(() => {
    if (beforeShow) dispatch({ type: "refreshSurface", surface: surface as never });
  }, [beforeShow, surface]);

  // payload → machine. TanStack Query guarantees `data` answers the *current*
  // key — a superseded request's data is not served as `data`, and the older
  // request itself is aborted through the signal passed to fetch. No manual
  // stale-guard is therefore required, and adding one would be dead code.
  useEffect(() => {
    if (!open) return;
    if (isFetching) {
      dispatch({ type: "request", draft: draft.trim() });
    } else if (payload) {
      dispatch({
        type: "resolve",
        payload,
        surface: state.status === "idle" ? (surface as never) : state.surface,
      });
    } else if (isError) {
      dispatch({ type: "fail" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, isFetching, isError, open]);

  const close = useCallback(() => {
    dispatch({ type: "close" });
    setActiveIndex(-1);
  }, []);

  /**
   * Commit a search: the one URL contract (`/browse?search=<term>`), then the
   * history write fire-and-forget — its errors are ignored by design; the
   * search has already happened.
   */
  /**
   * Commit a search: the one URL contract (`/browse?search=<term>`), then the
   * history write fire-and-forget — its errors are ignored by design; the
   * search has already happened.
   */
  const runSearch = useCallback(
    (termRaw: string) => {
      const term = termRaw.trim();
      close();
      setDraft("");
      if (term.length === 0) return;
      void navigate({ to: "/browse", search: { search: term } });
      recordSearchTerm(term, !!user, queryClient);
      if (overlay) onClose?.();
    },
    [close, navigate, overlay, onClose, user, queryClient],
  );

  const openOption = useCallback(
    (option: (typeof options)[number] | undefined) => {
      if (!option) return;
      close();
      if (option.kind === "term") {
        runSearch(option.value);
        return;
      }
      if (option.kind === "product") {
        void navigate({ to: "/product/$slug", params: { slug: option.product.slug } });
        return;
      }
      if (option.kind === "category") {
        void navigate({
          to: "/categories/$categorySlug",
          params: { categorySlug: option.category.slug },
        });
        return;
      }
      if (option.kind === "brand") {
        void navigate({ to: "/browse", search: { brand: option.brand.slug } });
      }
    },
    [close, navigate, runSearch],
  );

  /** Enter with no active option, or the hero's submit button. */
  const submitDraft = useCallback(() => {
    openOption(
      activeOption ??
        (draft.trim().length > 0 ? ({ kind: "term", value: draft.trim() } as const) : undefined),
    );
  }, [activeOption, draft, openOption]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (draft.length > 0) {
          // "Esc clears then closes": the first press empties the field; the
          // next press closes.
          setDraft("");
          return;
        }
        if (overlay) onClose?.();
        close();
        return;
      }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (options.length === 0) return;
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      if (options.length > 0) setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (options.length > 0) setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submitDraft();
    }
  }

  function onInputChange(next: string) {
    setDraft(next);
    if (next.trim().length < SEARCH_MIN_DRAFT_LENGTH) {
      // "< 2 chars keeps focusedEmpty": the dropdown snaps (back) to the empty
      // surface, and no request is committed.
      dispatch({ type: "focus", surface });
    } else {
      dispatch({ type: "type", draft: next });
    }
  }

  function onInputFocus() {
    if (!open) dispatch({ type: "focus", surface });
  }

  function onClear() {
    setDraft("");
    dispatch({ type: "focus", surface: state.status !== "idle" ? state.surface : surface });
  }

  return {
    variant,
    overlay,
    draft,
    setDraft,
    state,
    dispatch,
    surface,
    open,
    options,
    activeIndex,
    setActiveIndex,
    activeOption,
    isFetching,
    retry,
    close,
    runSearch,
    openOption,
    submitDraft,
    onKeyDown,
    onInputChange,
    onInputFocus,
    onClear,
    user,
    queryClient,
  };
}

type SearchBoxController = ReturnType<typeof useSearchBoxController>;

/* ------------------------------- entry points -------------------------------- */

export function SearchBox(props: SearchBoxProps) {
  if (props.variant === "overlay") return <SearchOverlay {...props} />;
  return <SearchBar variant={props.variant} />;
}

/* --------------------------- navbar / hero variant --------------------------- */

export function SearchBar({ variant }: { variant: "navbar" | "hero" }) {
  const controller = useSearchBoxController({ variant, overlay: false });
  const { state } = controller;
  const hero = variant === "hero";

  // The DOM ref is component-scope and only used for focus UI: the hook and the
  // panel never need to reach into it (React Compiler-safe ref discipline).
  const inputRef = useRef<HTMLInputElement>(null);

  /* ------------------------------- '/' focus -------------------------------- */
  useEffect(() => {
    function onSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      if (Date.now() - lastSlashHandledAt < 50) return;
      // Ownership: hero owns while it is on screen; navbar otherwise.
      const heroOnScreen = isHeroSearchOnScreen();
      if (variant === "hero" ? !heroOnScreen : heroOnScreen) return;
      lastSlashHandledAt = Date.now();
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onSlash);
    return () => document.removeEventListener("keydown", onSlash);
  }, [variant]);

  const scopeId = useId();
  const listboxId = `${scopeId}-listbox`;

  const barClassName = hero
    ? "inset-surface flex h-12 items-center gap-1.5 rounded-full p-1.5 pl-3.5 sm:h-14 sm:gap-2 sm:pl-5 sm:pr-2"
    : "inset-surface flex h-10 items-center gap-1 rounded-full pl-3.5 pr-1";

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        controller.submitDraft();
      }}
      className="rounded-full focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background"
    >
      <div
        className={barClassName}
        role="combobox"
        aria-expanded={controller.open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          controller.activeOption ? optionId(listboxId, controller.activeIndex) : undefined
        }
      >
        <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        <label className="sr-only" htmlFor={`${scopeId}-input`}>
          Search the marketplace
        </label>
        <input
          ref={inputRef}
          id={`${scopeId}-input`}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          aria-autocomplete="list"
          value={controller.draft}
          placeholder={hero ? "Search cameras, laptops, bikes…" : "Search anything..."}
          className={`min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground ${
            hero ? "h-9 sm:h-10" : "h-8"
          } [&::-webkit-search-cancel-button]:hidden`}
          onChange={(event) => controller.onInputChange(event.target.value)}
          onFocus={controller.onInputFocus}
          onBlur={controller.close}
          onKeyDown={controller.onKeyDown}
        />
        {controller.draft.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={controller.onClear}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X size={15} aria-hidden />
          </button>
        )}
        {controller.isFetching && (
          <Loader2
            size={15}
            className="mr-0.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
        {hero && (
          <Button
            type="submit"
            size="icon"
            aria-label="Search"
            disabled={controller.draft.trim().length === 0}
            className="shrink-0 rounded-full"
          >
            <ArrowRight size={16} aria-hidden />
          </Button>
        )}
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {liveAnnouncement(state, controller.isFetching)}
      </p>

      <AnimatePresence>
        {controller.open && (
          <SearchPanel key={`panel-${scopeId}`} controller={controller} listboxId={listboxId} />
        )}
      </AnimatePresence>
    </form>
  );
}

/* --------------------------------- panel ------------------------------------- */

function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

function liveAnnouncement(state: SearchBoxState, isFetching: boolean): string {
  if (state.status === "loading" || isFetching) return "Searching";
  if (state.status === "results" && state.payload) {
    return `${state.payload.products.length} products found, plus categories and brands`;
  }
  if (state.status === "noResults") return "No results found";
  if (state.status === "error") return "Search failed, retry available";
  if (state.status === "focusedEmpty") {
    return `${state.surface.recents.length + state.surface.trendingTerms.length} suggestions available`;
  }
  return "";
}

function optionRowClass(selected: boolean): string {
  return [
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition cursor-pointer",
    selected
      ? "bg-primary/10 text-foreground"
      : "text-foreground hover:bg-primary/10 active:bg-primary/15",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
  ].join(" ");
}

function SearchPanel(props: { controller: SearchBoxController; listboxId: string }) {
  const { controller, listboxId } = props;
  const { state } = controller;

  // One navigation model: row indices are offsets into flattenOptions' order —
  // recents → trending | categories(empty state) | products → categories → brands.
  const optionButton = (index: number) => ({
    id: optionId(listboxId, index),
    role: "option",
    type: "button" as const,
    "aria-selected": index === controller.activeIndex,
    className: optionRowClass(index === controller.activeIndex),
    onPointerMove: () => controller.setActiveIndex(index),
    onClick: () => controller.openOption(flattenOptions(state)[index]),
  });

  const pickTerm = (term: string) => {
    controller.setDraft(term);
    controller.runSearch(term);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      role="presentation"
      className="raised-surface absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl p-2"
      // The classic combobox trick: mousedown is prevented so choosing an
      // option never blurs the input first — no pointerdown flag, no blur
      // timeout, the input keeps focus and the click simply lands.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div role="listbox" id={listboxId} aria-label="Search suggestions">
        {state.status === "focusedEmpty" && (
          <EmptyPanel
            controller={controller}
            optionButton={optionButton}
            pickTerm={pickTerm}
          />
        )}

        {state.status === "loading" && (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" aria-busy="true">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Searching…
          </div>
        )}

        {state.status === "error" && (
          <button
            type="button"
            onClick={controller.retry}
            className={`${optionRowClass(false)} py-3`}
          >
            <X size={15} aria-hidden className="text-destructive" />
            Something went wrong.
            <span className="font-medium text-primary underline">Try again</span>
          </button>
        )}

        {state.status === "noResults" && (
          <>
            <NoResults
              query={state.payload.query}
              didYouMean={state.payload.didYouMean}
              onPickDidYouMean={pickTerm}
            />
            {state.payload.categories.length > 0 && (
              <OptionGroup label="Categories" icon={<Trees size={13} aria-hidden />}>
                {state.payload.categories.slice(0, 4).map((category, index) => (
                  <button key={`cat-${category.slug}`} {...optionButton(index)}>
                    <Trees size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      <Highlight text={category.name} query={state.payload.query} />
                    </span>
                  </button>
                ))}
              </OptionGroup>
            )}
          </>
        )}

        {state.status === "results" && (
          <>
            <OptionGroup label="Products" icon={<Package size={13} aria-hidden />}>
              {state.payload.products.map((product, index) => (
                <ProductRow key={`prod-${product.id}`} product={product} optionProps={optionButton(index)} query={state.payload.query} />
              ))}
            </OptionGroup>
            {state.payload.categories.length > 0 && (
              <OptionGroup label="Categories" icon={<Trees size={13} aria-hidden />}>
                {state.payload.categories.map((category, offset) => {
                  const index = state.payload.products.length + offset;
                  return (
                    <button key={`cat-${category.slug}`} {...optionButton(index)}>
                      <Trees size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        <Highlight text={category.name} query={state.payload.query} />
                      </span>
                    </button>
                  );
                })}
              </OptionGroup>
            )}
            {state.payload.brands.length > 0 && (
              <OptionGroup label="Brands" icon={<Tag size={13} aria-hidden />}>
                {state.payload.brands.map((brand, offset) => {
                  const index =
                    state.payload.products.length + state.payload.categories.length + offset;
                  return (
                    <button key={`brand-${brand.slug}`} {...optionButton(index)}>
                      <Tag size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        <Highlight text={brand.name} query={state.payload.query} />
                      </span>
                    </button>
                  );
                })}
              </OptionGroup>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------------------- empty-surface panel ----------------------------- */

function EmptyPanel(props: {
  controller: SearchBoxController;
  optionButton: (index: number) => Record<string, unknown>;
  pickTerm: (term: string) => void;
}) {
  const { controller, optionButton, pickTerm } = props;
  const { state } = controller;
  if (state.status !== "focusedEmpty") return null;
  const recents = state.surface.recents;
  const trending = state.surface.trendingTerms;

  if (recents.length === 0 && trending.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
        <Loader2
          size={15}
          className={controller.isFetching ? "animate-spin" : "opacity-40"}
          aria-hidden
        />
        {controller.isFetching ? "Loading suggestions…" : "No searches yet — start typing."}
      </div>
    );
  }

  return (
    <>
      {recents.length > 0 && (
        <OptionGroup label="Recent searches" icon={<Clock size={13} aria-hidden />}>
          {recents.map((recent, index) => (
            <RecentRow
              key={`recent-${recent.term}`}
              optionProps={optionButton(index)}
              recent={recent}
              onPick={pickTerm}
              onRemove={() =>
                removeSearchRecent(recent, !!controller.user, controller.queryClient)
              }
            />
          ))}
        </OptionGroup>
      )}
      {trending.length > 0 && (
        <OptionGroup label="Trending" icon={<Flame size={13} aria-hidden />}>
          {trending.map((term, offset) => {
            const index = recents.length + offset;
            return (
              <button key={`trend-${term}`} {...optionButton(index)}>
                <Flame size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">{term}</span>
              </button>
            );
          })}
        </OptionGroup>
      )}
    </>
  );
}

function OptionGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function RecentRow({
  optionProps,
  recent,
  onPick,
  onRemove,
}: {
  optionProps: Record<string, unknown>;
  recent: SearchRecent;
  onPick: (term: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center">
      <button type="button" {...optionProps} onClick={() => onPick(recent.term)}>
        <Clock size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{recent.term}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove recent search ${recent.term}`}
        onClick={onRemove}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}

function ProductRow({
  product,
  optionProps,
  query,
}: {
  product: SuggestedProduct;
  optionProps: Record<string, unknown>;
  query: string;
}) {
  return (
    <button type="button" {...optionProps}>
      {product.image ? (
        <img src={product.image} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <Package size={17} aria-hidden className="shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate text-left">
        <Highlight text={product.title} query={query} />
      </span>
      <span className="ml-2 hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {product.categoryName}
        {product.pricePerDay != null ? ` · ₹${product.pricePerDay}/day` : ""}
      </span>
    </button>
  );
}

function NoResults({
  query,
  didYouMean,
  onPickDidYouMean,
}: {
  query: string;
  didYouMean?: string;
  onPickDidYouMean: (term: string) => void;
}) {
  return (
    <p className="px-3 py-3 text-sm">
      No results for “<span className="font-medium">{query}</span>”.
      {didYouMean && (
        <>
          {" "}
          Did you mean{" "}
          <button
            type="button"
            onClick={() => onPickDidYouMean(didYouMean)}
            className="font-medium text-primary underline"
          >
            {didYouMean}
          </button>
          ?
        </>
      )}
    </p>
  );
}

/* ------------------------------- overlay variant ------------------------------ */

function SearchOverlay({ onClose, autoFocus = true }: SearchBoxProps) {
  const controller = useSearchBoxController({ variant: "overlay", overlay: true, onClose });
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scopeId = useId();
  const listboxId = `${scopeId}-listbox`;
  const mountedPathname = useRef(pathname);

  // Route changed while open (e.g. a recent-search pick) — the overlay's job
  // is done; the network/base chrome must come back.
  useEffect(() => {
    if (mountedPathname.current !== pathname) onClose?.();
    mountedPathname.current = pathname;
  }, [pathname, onClose]);

  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role="dialog"
      aria-modal="true"
      aria-label="Search the marketplace"
      className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="page-wrap flex w-full items-center gap-2 py-4">
        <div className="inset-surface relative flex min-w-0 flex-1 items-center gap-1.5 rounded-full p-1.5 pl-3.5">
          <Search size={18} className="shrink-0 text-muted-foreground" aria-hidden />
          <label className="sr-only" htmlFor={`${scopeId}-input`}>
            Search the marketplace
          </label>
          <input
            ref={inputRef}
            id={`${scopeId}-input`}
            type="search"
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint="search"
            aria-autocomplete="list"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={controller.open}
            aria-activedescendant={
              controller.activeOption ? optionId(listboxId, controller.activeIndex) : undefined
            }
            value={controller.draft}
            placeholder="Search cameras, laptops, bikes…"
            className="h-10 min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => controller.onInputChange(event.target.value)}
            onFocus={controller.onInputFocus}
            onKeyDown={controller.onKeyDown}
          />
          {controller.isFetching && (
            <Loader2
              size={15}
              className="mr-0.5 shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          {controller.draft.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={controller.onClear}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Close search"
          onClick={onClose}
          className="shrink-0 rounded-full"
        >
          <X size={18} aria-hidden />
        </Button>
      </div>

      <div className="page-wrap min-h-0 flex-1 overflow-y-auto pb-6">
        <AnimatePresence mode="wait">
          {controller.open ? (
            <OverlayPanel key="overlay-panel" controller={controller} listboxId={listboxId} />
          ) : (
            <motion.p
              key="overlay-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pt-2 text-sm text-muted-foreground"
            >
              Start typing to search the marketplace.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body,
  );
}

function OverlayPanel(props: { controller: SearchBoxController; listboxId: string }) {
  const { controller, listboxId } = props;
  const { state } = controller;

  const optionButton = (index: number) => ({
    id: optionId(listboxId, index),
    role: "option",
    type: "button" as const,
    "aria-selected": index === controller.activeIndex,
    className: `${optionRowClass(index === controller.activeIndex)} py-3 text-[15px]`,
    onPointerMove: () => controller.setActiveIndex(index),
    onClick: () => controller.openOption(flattenOptions(state)[index]),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      role="listbox"
      id={listboxId}
      aria-label="Search suggestions"
      className="flex flex-col gap-1 py-2"
    >
      {state.status === "focusedEmpty" && <EmptyPanelRows controller={controller} optionButton={optionButton} />}
      {state.status === "loading" && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" aria-hidden /> Searching…
        </div>
      )}
      {state.status === "error" && (
        <button type="button" onClick={controller.retry} className={optionRowClass(false)}>
          <X size={15} aria-hidden className="text-destructive" />
          Something went wrong.
          <span className="font-medium text-primary underline">Try again</span>
        </button>
      )}
      {state.status === "noResults" && (
        <>
          <NoResults
            query={state.payload.query}
            didYouMean={state.payload.didYouMean}
            onPickDidYouMean={controller.setDraft}
          />
          {state.payload.categories.length > 0 && (
            <OptionGroup label="Categories" icon={<Trees size={13} aria-hidden />}>
              {state.payload.categories.slice(0, 4).map((category, index) => (
                <button key={`cat-${category.slug}`} {...optionButton(index)}>
                  <Trees size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-left">{category.name}</span>
                </button>
              ))}
            </OptionGroup>
          )}
        </>
      )}
      {state.status === "results" && (
        <>
          <OptionGroup label="Products" icon={<Package size={13} aria-hidden />}>
            {state.payload.products.map((product, index) => (
              <button key={`prod-${product.id}`} {...optionButton(index)}>
                {product.image ? (
                  <img src={product.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <Package size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  <Highlight text={product.title} query={state.payload.query} />
                </span>
              </button>
            ))}
          </OptionGroup>
          {state.payload.categories.length > 0 && (
            <OptionGroup label="Categories" icon={<Trees size={13} aria-hidden />}>
              {state.payload.categories.map((category, offset) => {
                const index = state.payload.products.length + offset;
                return (                    <button key={`cat-${category.slug}`} {...optionButton(index)}>
                    <Trees size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      <Highlight text={category.name} query={state.payload.query} />
                    </span>
                  </button>
                );
              })}
            </OptionGroup>
          )}
          {state.payload.brands.length > 0 && (
            <OptionGroup label="Brands" icon={<Tag size={13} aria-hidden />}>
              {state.payload.brands.map((brand, offset) => {
                const index =
                  state.payload.products.length + state.payload.categories.length + offset;
                return (                    <button key={`brand-${brand.slug}`} {...optionButton(index)}>
                    <Tag size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      <Highlight text={brand.name} query={state.payload.query} />
                    </span>
                  </button>
                );
              })}
            </OptionGroup>
          )}
        </>
      )}
    </motion.div>
  );
}

function EmptyPanelRows({
  controller,
  optionButton,
}: {
  controller: SearchBoxController;
  optionButton: (index: number) => Record<string, unknown>;
}) {
  const { state } = controller;
  if (state.status !== "focusedEmpty") return null;
  const recents = state.surface.recents;
  const trending = state.surface.trendingTerms;

  if (recents.length === 0 && trending.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">No searches yet — start typing.</p>
    );
  }
  return (
    <div className="contents">
      {recents.length > 0 && (
        <OptionGroup label="Recent searches" icon={<Clock size={13} aria-hidden />}>
          {recents.map((recent, index) => (
            <RecentRow
              key={`recent-${recent.term}`}
              optionProps={optionButton(index)}
              recent={recent}
              onPick={controller.runSearch}
              onRemove={() => removeSearchRecent(recent, !!controller.user, controller.queryClient)}
            />
          ))}
        </OptionGroup>
      )}
      {trending.length > 0 && (
        <OptionGroup label="Trending" icon={<Flame size={13} aria-hidden />}>
          {trending.map((term, offset) => {
            const index = recents.length + offset;
            return (
              <button key={`trend-${term}`} {...optionButton(index)}>
                <Flame size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">{term}</span>
              </button>
            );
          })}
        </OptionGroup>
      )}
    </div>
  );
}

/* ---------------------- navbar collapse (homepage placement) ------------------ */

/*
 * Hero visibility as an external store: IntersectionObserver events are an
 * external system, so the subscription lives in `useSyncExternalStore` — no
 * setState-inside-effect, and a single observer for all calling bars.
 */
let heroVisible = false;
let heroObservers = 0;
let heroObserver: IntersectionObserver | null = null;

function updateHeroVisibility(next: boolean, notify: () => void) {
  if (next !== heroVisible) {
    heroVisible = next;
    notify();
  }
}

function subscribeHeroVisibility(notify: () => void): () => void {
  heroObservers += 1;
  if (heroObservers === 1) {
    const hero = document.getElementById("hero-search");
    if (hero && typeof IntersectionObserver !== "undefined") {
      heroObserver = new IntersectionObserver(
        (entries) =>
          updateHeroVisibility(entries.some((entry) => entry.isIntersecting), notify),
        { threshold: 0 },
      );
      heroObserver.observe(hero);
    } else {
      updateHeroVisibility(false, notify);
    }
  }
  return () => {
    heroObservers -= 1;
    if (heroObservers === 0 && heroObserver) {
      heroObserver.disconnect();
      heroObserver = null;
    }
  };
}

function getHeroVisibilitySnapshot(): boolean {
  // Between subscribing and the first intersection callback (the first render),
  // a synchronous rect check keeps the very first frame honest.
  if (heroObservers === 0) return isHeroSearchOnScreen();
  return heroVisible;
}

/** True while `#hero-search` is on screen (IntersectionObserver; false elsewhere). */
export function useHeroSearchVisibility(enabled: boolean): boolean {
  const visible = useSyncExternalStore(subscribeHeroVisibility, getHeroVisibilitySnapshot, () => false);
  return enabled ? visible : false;
}

/**
 * Where the navbar variant sits. On the homepage it collapses to an icon while
 * the hero search is visible (IntersectionObserver) and expands when it
 * leaves; only width and opacity animate, so the navbar's own height never
 * shifts. Below 640px the bar is hidden and an icon opens the overlay.
 */
export function NavbarSearch({ onHomepage = false }: { onHomepage?: boolean }) {
  const heroVisible = useHeroSearchVisibility(onHomepage);
  const [expanded, setExpanded] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const mobileTrigger = (
    <button
      type="button"
      aria-label="Search"
      data-testid="mobile-search-trigger"
      onClick={() => setOverlayOpen(true)}
      className="soft-button flex size-10 items-center justify-center rounded-full sm:hidden"
    >
      <Search size={17} aria-hidden />
    </button>
  );

  const ariaExpanded = expanded || !heroVisible;

  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={{ width: !onHomepage || !heroVisible || expanded ? 184 : 40, opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="hidden min-w-0 items-center overflow-hidden sm:block"
      >
        {ariaExpanded ? (
          <SearchBox variant="navbar" />
        ) : (
          <button
            type="button"
            aria-label="Expand search"
            data-testid="navbar-search-collapsed"
            onClick={() => setExpanded(true)}
            className="soft-button mx-auto flex size-10 items-center justify-center rounded-full"
          >
            <Search size={17} aria-hidden />
          </button>
        )}
      </motion.div>
      {mobileTrigger}
      {overlayOpen && (
        <SearchBox variant="overlay" onClose={() => setOverlayOpen(false)} />
      )}
    </div>
  );
}
