import { Badge } from "@/components/ui/badge";

const map: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  BLOCKED: "Blocked",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge>{map[status] ?? status}</Badge>;
}
