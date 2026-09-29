import { createFileRoute } from "@tanstack/react-router";
import { categoriesRouteOptions } from "@/features/categories/route";

export const Route = createFileRoute("/categories/")(categoriesRouteOptions);
