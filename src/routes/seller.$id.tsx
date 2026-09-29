import { createFileRoute } from "@tanstack/react-router";
import { SellerPage } from "@/features/seller-dashboard/profile";

export const Route = createFileRoute("/seller/$id")({
  component: SellerPage,
});
