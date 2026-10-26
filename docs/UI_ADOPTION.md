# UI Adoption Audit (U1 - STEP 0)

## UI Primitives (src/components/ui)
- badge.tsx, button.tsx, card.tsx, dialog.tsx, dropdown-menu.tsx, input.tsx, native-select.tsx, sheet.tsx, skeleton.tsx, table.tsx, textarea.tsx, tooltip.tsx

## Shared Components (src/components/shared)
- brand-mark.tsx, empty-state.tsx, error-state.tsx, location-autocomplete.tsx, product-card.tsx, product-image.tsx, product-filters/*, search-box.tsx, star-rating.tsx, stat-card.tsx

## Candidates for shared primitives
| Pattern | Source lib | Usage | Deps | Allowed | Notes |
| --- | --- | --- | --- | --- | --- |
| Tabs (animated indicator) | shadcn/ui | nav/tabs across site | @radix-ui/react-tabs (check) | yes (build on existing patterns) | Need Tabs + animated underline via layoutId |
| Switch | hand-built | settings/toggles | none | yes | button role=switch |
| Accordion | hand-built (Motion height) | FAQ/settings | framer-motion | yes | no Radix accordion installed |
| Slider/Progress | hand-built/native styled | forms/metrics | none | yes | |
| Alert/Callout, Breadcrumb, Pagination, Stepper, EmptyState, ErrorState, InlineNotice, Stat card, Kbd | shadcn/Skiper inspired (restyled) | sitewide | none/Radix existing | yes if restyled to tokens | build hand, no new packages |

## Framer Motion usage (categorised)
- Carousel/hero: enter/exit, auto-advance - keep
- Drawer/sheet transitions - via existing
- Hover/press - to be standardized in motion kit
- Reveal on view - add via IntersectionObserver + motion

## Notes
- No new packages to be added. All patterns implemented with existing deps or native elements.
- Revaro tokens preserved; only restyled.
- Skiper UI/Vengeance UI used as inspiration only, no copied premium code; attribution recorded if adapted.
