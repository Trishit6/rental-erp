import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "@/features/admin";

/**
 * `/admin/support` — the staff support inbox (PROMPT 30).
 *
 * Guarded by the parent layout's `requireAdmin`, and every read/write inside is gated
 * on `support.view` / `support.reply` server-side. Opening the linked order to refund
 * is separately gated on `orders.refund`, so answering a ticket and returning money
 * stay two different capabilities.
 */
export const Route = createFileRoute("/admin/support")({
  component: AdminSupportPage,
});
