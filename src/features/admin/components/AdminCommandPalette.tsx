import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { hasPermission, type AdminAccess } from "../access";
import { ADMIN_NAV } from "./AdminSidebar";

/**
 * The admin command palette (PROMPT 22).
 *
 * ## Why a palette on top of the sidebar and the topbar search
 *
 * The sidebar answers "where can I go?" only while it is on screen — below `lg` it
 * is behind a "Sections" button, and on every breakpoint it asks the reader to scan
 * a rail. `Ctrl/Cmd+K` is the shortcut an operator already has in their fingers, and
 * the palette is the same list, filtered as they type.
 *
 * ## Why it is permission-filtered here too
 *
 * The palette is a list of *destinations*, and a destination this account cannot use
 * is a 403 waiting to happen. It filters with the same `hasPermission` the sidebar
 * uses, so the two cannot disagree; the server remains the authority either way.
 *
 * ## Why the panel is a separate, keyed component
 *
 * The panel's term and highlight must reset every time it opens, and resetting state
 * inside an effect is the cascade the lint rule (rightly) forbids. Radix unmounts the
 * dialog content when it closes, so mounting the panel fresh on each open gives the
 * reset for free — `useState`'s initial value *is* the reset.
 */

type PaletteCommand = {
  id: string;
  label: string;
  group: string;
  to: string;
  keywords: string;
};

export function AdminCommandPalette({
  open,
  onOpenChange,
  access,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access?: AdminAccess;
}) {
  const navigate = useNavigate();

  // `Ctrl/Cmd+K` from anywhere in the workspace toggles the palette. Registered on
  // the window so it works regardless of which control has focus, and it always
  // suppresses the browser's own binding.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-24 max-w-xl translate-y-0 p-0"
        aria-label="Command palette"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <PalettePanel
          access={access}
          onRun={(to) => {
            onOpenChange(false);
            void navigate({ to });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PalettePanel({
  access,
  onRun,
}: {
  access?: AdminAccess;
  onRun: (to: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => {
    const list: PaletteCommand[] = [];
    for (const section of ADMIN_NAV) {
      for (const item of section.items) {
        if (!item.to) continue;
        if (!hasPermission(access, item.permission)) continue;
        list.push({
          id: item.to,
          label: item.label,
          group: section.title,
          to: item.to,
          keywords: `${item.label} ${section.title}`.toLowerCase(),
        });
      }
    }
    return list;
  }, [access]);

  const matches = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return commands;
    return commands.filter((command) => command.keywords.includes(query));
  }, [commands, term]);

  const maxIndex = Math.max(matches.length - 1, 0);
  const activeIndex = Math.min(highlighted, maxIndex);

  // Focus the field on mount — an external-system effect, not a state write.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function run(command: PaletteCommand | undefined) {
    if (!command) return;
    onRun(command.to);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted(Math.min(activeIndex + 1, maxIndex));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(matches[activeIndex]);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--divider)] px-4 py-3">
        <Command size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setHighlighted(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls="admin-command-list"
          aria-activedescendant={
            matches[activeIndex] ? `admin-command-${matches[activeIndex].id}` : undefined
          }
          placeholder="Jump to a section…"
          aria-label="Jump to a section"
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      <ul
        id="admin-command-list"
        role="listbox"
        aria-label="Admin sections"
        className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
      >
        {matches.map((command, index) => {
          const active = index === activeIndex;
          return (
            <li key={command.id} role="presentation">
              <button
                type="button"
                id={`admin-command-${command.id}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => run(command)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                  active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/60",
                )}
              >
                <span className="font-bold">{command.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{command.group}</span>
              </button>
            </li>
          );
        })}
        {matches.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            No section matches “{term}”.
          </li>
        ) : null}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--divider)] px-4 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CornerDownLeft size={12} aria-hidden /> to open
        </span>
        <span>Esc to close</span>
      </div>
    </>
  );
}
