import { createFileRoute } from "@tanstack/react-router";
import { categoryDetailRouteOptions } from "@/features/categories/route";

export const Route = createFileRoute("/categories/$categorySlug")(categoryDetailRouteOptions);
