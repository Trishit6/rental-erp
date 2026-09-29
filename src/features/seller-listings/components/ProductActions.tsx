import { Archive, Pause, Play, Trash2 } from "lucide-react";
import type { MyProduct } from "../query";

export function ProductActions({
  product,
  onSetStatus,
  onDelete,
}: {
  product: MyProduct;
  onSetStatus: (id: number, status: string) => Promise<void>;
  onDelete: (product: MyProduct) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {product.status === "PUBLISHED" ? (
        <button
          type="button"
          aria-label="Pause"
          className="rounded-full p-1.5 hover:bg-primary/10"
          onClick={() => void onSetStatus(product.id, "PAUSED")}
        >
          <Pause size={14} />
        </button>
      ) : product.status === "PAUSED" ? (
        <button
          type="button"
          aria-label="Publish"
          className="rounded-full p-1.5 hover:bg-primary/10"
          onClick={() => void onSetStatus(product.id, "PUBLISHED")}
        >
          <Play size={14} />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Archive"
        className="rounded-full p-1.5 hover:bg-primary/10"
        onClick={() => void onSetStatus(product.id, "ARCHIVED")}
      >
        <Archive size={14} />
      </button>
      <button
        type="button"
        aria-label="Delete"
        className="rounded-full p-1.5 text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(product)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
