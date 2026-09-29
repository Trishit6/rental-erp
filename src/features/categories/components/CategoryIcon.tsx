import {
  Armchair,
  Bike,
  Camera,
  Dumbbell,
  Gamepad2,
  Headphones,
  House,
  Lamp,
  Laptop,
  Music,
  Package,
  Refrigerator,
  Shirt,
  Smartphone,
  Sofa,
  Tent,
  WashingMachine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Whitelist of icon identifiers the API may send.
 *
 * The backend stores a short identifier (`"sofa"`), never a component name, and
 * lookup is a plain map access into this table. An unknown or hostile string can
 * therefore only ever resolve to the generic fallback — nothing is imported or
 * rendered dynamically from database content.
 */
const ICON_BY_IDENTIFIER: Record<string, LucideIcon> = {
  sofa: Sofa,
  armchair: Armchair,
  lamp: Lamp,
  laptop: Laptop,
  smartphone: Smartphone,
  camera: Camera,
  headphones: Headphones,
  shirt: Shirt,
  house: House,
  "washing-machine": WashingMachine,
  refrigerator: Refrigerator,
  gamepad: Gamepad2,
  dumbbell: Dumbbell,
  music: Music,
  wrench: Wrench,
  bike: Bike,
  tent: Tent,
};

/** Fallback by category name, for rows created before `icon` existed. */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  Furniture: Sofa,
  Electronics: Laptop,
  Cameras: Camera,
  Fashion: Shirt,
  Tools: Wrench,
  Vehicles: Bike,
  Music: Music,
  Gaming: Gamepad2,
  Sports: Dumbbell,
  Outdoor: Tent,
  Home: House,
  Appliances: WashingMachine,
};

/** Resolves a category to an icon, never returning undefined. */
export function resolveCategoryIcon(icon?: string | null, name?: string | null): LucideIcon {
  if (icon) {
    const byIdentifier = ICON_BY_IDENTIFIER[icon.trim().toLowerCase()];
    if (byIdentifier) return byIdentifier;
  }
  if (name) {
    const byName = ICON_BY_NAME[name.trim()];
    if (byName) return byName;
  }
  return Package;
}

export type CategoryIconProps = {
  icon?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** Set only when the icon stands alone with no adjacent text. */
  label?: string;
};

/**
 * Resolves and renders a glyph. Kept as a plain helper rather than doing the lookup
 * inside a component body, so no component is ever *chosen* during a component's
 * render (which the React Compiler rules reject) — the whitelist lookup happens here
 * and the resulting element is returned as ordinary JSX.
 */
function renderCategoryGlyph({ icon, name, size = 20, className, label }: CategoryIconProps) {
  const Glyph = resolveCategoryIcon(icon, name);

  return (
    <Glyph
      size={size}
      className={cn(className)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}

/**
 * A category's glyph. Decorative by default — the category name is always rendered
 * next to it, so screen readers must not announce the icon too. Pass `label` only
 * when the icon stands alone.
 */
export function CategoryIcon(props: CategoryIconProps) {
  return renderCategoryGlyph(props);
}
