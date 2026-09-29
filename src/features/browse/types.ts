/**
 * Browse's view of the shared product-search vocabulary.
 *
 * The types themselves live in `lib/product-search` (and the words they are built
 * from in `lib/types`), because a category page needs exactly the same URL state,
 * request shape and filter pills — and features must never import each other. This
 * module only fixes Browse's local names onto them.
 */
export type {
  ActiveFilter,
  ConditionFilterValue,
  ListingMode,
  ProductAvailability,
  ProductCondition,
  ProductFilters as BrowseFilters,
  ProductListItem,
  ProductListResponse,
  ProductSearch as BrowseSearch,
  ProductSort,
} from "@/lib/product-search/types";
