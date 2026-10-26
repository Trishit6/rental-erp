import { z } from "zod";

export type ReportDef = {
  key: string;
  group: "Sales" | "Operations" | "People" | "Finance" | "Support";
  label: string;
  permission: string;
  pii?: boolean;
  filterSchema?: any;
  columns: Array<{ key: string; label: string; type: "text" | "integer" | "money" | "date" | "datetime" | "percent" }>;
};

const baseFilter = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
}).passthrough();

export const REPORTS_REGISTRY: ReportDef[] = [
  {
    key: "revenue",
    group: "Sales",
    label: "Revenue",
    permission: "orders.view",
    columns: [
      { key: "period", label: "Period", type: "date" },
      { key: "gmv", label: "GMV (INR)", type: "money" },
      { key: "platform_fees", label: "Platform fees (INR)", type: "money" },
      { key: "tax", label: "Tax (INR)", type: "money" },
      { key: "refunds", label: "Refunds (INR)", type: "money" },
      { key: "net", label: "Net (INR)", type: "money" },
    ],
  },
  {
    key: "orders",
    group: "Sales",
    label: "Orders",
    permission: "orders.view",
    columns: [
      { key: "id", label: "Order ID", type: "integer" },
      { key: "created_at", label: "Created", type: "datetime" },
      { key: "status", label: "Status", type: "text" },
      { key: "total_paise", label: "Total (INR)", type: "money" },
    ],
  },
  {
    key: "rentals",
    group: "Operations",
    label: "Rentals",
    permission: "rentals.view",
    columns: [
      { key: "id", label: "Rental ID", type: "integer" },
      { key: "start_date", label: "Start", type: "date" },
      { key: "end_date", label: "End", type: "date" },
      { key: "status", label: "Status", type: "text" },
    ],
  },
  {
    key: "users",
    group: "People",
    label: "Users",
    permission: "users.view",
    pii: true,
    filterSchema: baseFilter,
    columns: [
      { key: "id", label: "User ID", type: "integer" },
      { key: "email_masked", label: "Email", type: "text" },
      { key: "created_at", label: "Created", type: "datetime" },
    ],
  },
  {
    key: "sellers",
    group: "People",
    label: "Sellers",
    permission: "vendors.view",
    columns: [
      { key: "seller_id", label: "Seller ID", type: "integer" },
      { key: "sales_count", label: "Sales", type: "integer" },
    ],
  },
  {
    key: "products",
    group: "Operations",
    label: "Products",
    permission: "products.moderate",
    columns: [
      { key: "id", label: "Product ID", type: "integer" },
      { key: "title", label: "Title", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ],
  },
  {
    key: "coupons",
    group: "Sales",
    label: "Coupons",
    permission: "coupons.view",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "redemptions", label: "Redemptions", type: "integer" },
      { key: "discount_given_paise", label: "Discount (INR)", type: "money" },
    ],
  },
  {
    key: "refunds",
    group: "Finance",
    label: "Refunds",
    permission: "refunds.view",
    columns: [
      { key: "id", label: "Refund ID", type: "integer" },
      { key: "amount_paise", label: "Amount (INR)", type: "money" },
      { key: "created_at", label: "Created", type: "datetime" },
    ],
  },
  {
    key: "support",
    group: "Support",
    label: "Support tickets",
    permission: "support.view",
    columns: [
      { key: "id", label: "Ticket ID", type: "integer" },
      { key: "status", label: "Status", type: "text" },
      { key: "created_at", label: "Created", type: "datetime" },
    ],
  },
  {
    key: "payouts",
    group: "Finance",
    label: "Payouts",
    permission: "payouts.view",
    columns: [
      { key: "id", label: "Payout ID", type: "integer" },
      { key: "amount_paise", label: "Amount (INR)", type: "money" },
      { key: "status", label: "Status", type: "text" },
    ],
  },
];

export function getReport(key: string) {
  return REPORTS_REGISTRY.find((r) => r.key === key);
}
export function listReports() {
  return REPORTS_REGISTRY;
}
