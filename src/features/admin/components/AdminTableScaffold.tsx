import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * The one scaffold every admin list table renders inside.
 *
 * ## Why one component, and why it is this dumb
 *
 * Eight sections need the same anatomy: a search box, optional dropdown filters,
 * a count line, a table, a pager, and the three states (loading / error / empty)
 * that a table without data can be in. Writing that eight times guarantees the
 * ninth state — the one nobody thought of — is missing from at least two of them.
 *
 * It is deliberately *not* clever: no generic column config, no sort machinery.
 * The catalogue's sortable-header pattern stayed in `AdminProductsTable`, where
 * sorting is a real need; these sections filter and page, which is what this
 * scaffold covers. A section renders its own `<Table>` as `children`, so anything
 * unusual stays normal JSX rather than becoming another prop axis.
 *
 * ## No thumbnail prop, on purpose
 *
 * A thumbnail is the one thing a table like these keeps wanting and this scaffold
 * deliberately does not offer. A prop that no section currently passes is a
 * prop with no second implementation to keep honest — it would ship as a
 * `(row) => string | null` returning null everywhere, and the first section to
 * use it would be the first place the fallback behaviour was decided. Sections
 * that show an image render `ProductImage` in their own cell, which is where the
 * loading, missing-image and sizing decisions already live and are already
 * shared.
 */

export type AdminTableFilterSelect = {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

export function AdminTableScaffold({
  icon,
  search,
  onSearch,
  isSearching,
  filters = [],
  onClearFilters,
  hasFilters,
  count,
  shownCount,
  isLoading,
  isError,
  onRetry,
  emptyTitle,
  emptyDescription,
  children,
  pager,
}: {
  icon: LucideIcon;
  search: string;
  onSearch: (term: string) => void;
  isSearching?: boolean;
  filters?: AdminTableFilterSelect[];
  onClearFilters: () => void;
  hasFilters: boolean;
  count: number;
  shownCount: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
  pager: ReactNode;
}) {
  const Icon = icon;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar
            id={`admin-search-${icon.displayName ?? "table"}`}
            label="Search"
            placeholder="Search…"
            value={search}
            onSearch={onSearch}
            isSearching={isSearching}
          />
          {filters.map((filter) => (
            <NativeSelect
              key={filter.key}
              label={filter.label}
              value={filter.value}
              onChange={(event) => filter.onChange(event.target.value)}
              options={filter.options}
            />
          ))}
          {hasFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-4">
            <EmptyState
              icon={Icon}
              title="Unable to load this section"
              description="We couldn't reach the server for this page. Please try again."
              action={
                <Button type="button" onClick={onRetry}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : count === 0 ? (
          <div className="p-4">
            <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <>
            <p className="border-b border-[var(--divider)] px-4 py-2.5 text-xs text-muted-foreground">
              {new Intl.NumberFormat("en-IN").format(count)} total
              {count > shownCount ? ` · showing ${shownCount} on this page` : ""}
            </p>
            <div className="overflow-x-auto">
              {children}
            </div>
            <div className="border-t border-[var(--divider)] px-4 py-3">{pager}</div>
          </>
        )}
      </Card>
    </div>
  );
}

/** The `<table>` wrapper with its default styling, used by every section. */
export function AdminTable({ children }: { children: ReactNode }) {
  return <Table>{children}</Table>;
}

export function AdminTableHead({ labels }: { labels: string[] }) {
  return (
    <TableHeader>
      <TableRow>
        {labels.map((label, index) => (
          <TableHead key={`${label}-${index}`} className={index === labels.length - 1 ? "text-right" : undefined}>
            {label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

export { TableBody, TableCell, TableRow };

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
