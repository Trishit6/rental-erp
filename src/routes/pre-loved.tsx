import { createFileRoute } from "@tanstack/react-router";
import { PreLovedPage } from "@/features/pre-loved";
import { validateQSearch } from "@/lib/browse-search";

export const Route = createFileRoute("/pre-loved")({
  validateSearch: validateQSearch,
  component: PreLovedPage,
});
