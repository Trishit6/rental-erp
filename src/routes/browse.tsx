import { createFileRoute } from "@tanstack/react-router";
import { browseRouteOptions } from "@/features/browse/route";

export const Route = createFileRoute("/browse")(browseRouteOptions);
