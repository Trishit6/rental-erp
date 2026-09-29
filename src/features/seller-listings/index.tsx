import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Package } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductActions } from "./components/ProductActions";
import { useMyProducts, useProductStatusActions, type MyProduct } from "./query";

const columnHelper = createColumnHelper<MyProduct>();

export function DashboardProductsPage() {
  const [confirmDelete, setConfirmDelete] = useState<MyProduct | null>(null);
  const { data: products, isLoading } = useMyProducts();
  const { setStatus, deleteProduct } = useProductStatusActions();

  async function handleDelete(id: number) {
    await deleteProduct(id);
    setConfirmDelete(null);
  }

  const columns = [
    columnHelper.accessor("title", {
      header: "Product",
      cell: (info) => (
        <div className="flex items-center gap-3">
          <img
            src={info.row.original.primaryImage ?? ""}
            alt=""
            className="size-10 rounded-xl object-cover"
          />
          <Link
            to="/product/$slug"
            params={{ slug: info.row.original.slug }}
            className="font-bold hover:text-primary"
          >
            {info.getValue()}
          </Link>
        </div>
      ),
    }),
    columnHelper.accessor("listingType", {
      header: "Type",
      cell: (info) => info.getValue(),
    }),
    columnHelper.accessor("purchasePrice", {
      header: "Buy",
      cell: (info) => (info.getValue() ? formatInr(info.getValue()!) : "—"),
    }),
    columnHelper.accessor("rentalPricePerDay", {
      header: "Rent/day",
      cell: (info) => (info.getValue() ? formatInr(info.getValue()!) : "—"),
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("viewCount", { header: "Views" }),
    columnHelper.accessor("favoriteCount", { header: "Saves" }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <ProductActions
          product={info.row.original}
          onSetStatus={setStatus}
          onDelete={setConfirmDelete}
        />
      ),
    }),
  ];

  const table = useReactTable({
    data: products ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="section-title text-3xl">My products</h1>
        <Button asChild size="sm">
          <Link to="/list">List a new item</Link>
        </Button>
      </div>

      {isLoading ? (
        <Card className="h-64 animate-pulse" />
      ) : !products?.length ? (
        <EmptyState
          icon={Package}
          title="No listings yet"
          description="Share your first item and start earning from things you already own."
          action={
            <Button asChild>
              <Link to="/list">List an item</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/60">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border/40 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
          <Card className="max-w-sm space-y-4 p-6 text-center">
            <h2 className="font-heading text-lg font-extrabold">Delete “{confirmDelete.title}”?</h2>
            <p className="text-sm text-muted-foreground">
              This removes the listing permanently. Order history is kept.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                className="bg-destructive"
                onClick={() => void handleDelete(confirmDelete.id)}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
