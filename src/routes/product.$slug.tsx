import { createFileRoute } from "@tanstack/react-router";
import { productRouteOptions } from "@/features/product-details/route";

export const Route = createFileRoute("/product/$slug")(productRouteOptions);
