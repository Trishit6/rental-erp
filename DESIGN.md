---
name: Revaro
description: Rent. Buy. Sell. Reuse.
colors:
  background: "#eceae2"
  foreground: "#2e2a25"
  primary: "#a86132"
  primary-foreground: "#fff7ed"
  accent: "#6b7c5e"
  accent-foreground: "#f2f6ee"
  muted-foreground: "#82796d"
  border: "#d8d1c3"
  destructive: "#b64032"
  destructive-foreground: "#fff7ed"
  card: "#eceae2"
  secondary: "#ded9cd"
  secondary-foreground: "#3a342d"
  muted: "#e1ddd2"
  surface: "#f2efe7"
  success: "#41603a"
  success-foreground: "#f2f6ee"
  warning: "#8a5a12"
  warning-foreground: "#fff6e6"
  info: "#2f5f7a"
  info-foreground: "#eef5f9"
  ring: "#a86132"
typography:
  display:
    fontFamily: "Nunito, sans-serif"
    fontSize: "clamp(3rem, 5vw, 4rem)"
    fontWeight: 900
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Nunito, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Nunito, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "22px"
  xxl: "28px"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
  3xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    padding: "0.75rem 1.75rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.full}"
    padding: "0.75rem 1.75rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0.75rem 1.75rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xxl}"
    padding: "1.5rem"
  badge:
    backgroundColor: "rgba(168, 97, 50, 0.1)"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
---
# Design System: Revaro

## Overview

**Creative North Star: "The Neighbour's Workshop"**

Revaro is a warm, tactile marketplace for renting, buying and sharing pre-loved items among neighbours. The system embraces a restrained neumorphic approach—soft, raised and inset surfaces model real material depth without resorting to harsh gradients or glossy highlights. Everything is tuned for clarity and trust: generous padding, readable type, and earth-toned colours that feel lived-in rather than sterile.

**Key Characteristics:**
- **Tactile restraint:** Depth is conveyed through dual-shadow pairs (dark and warm light) to create subtle edge lighting, never a halo or bloom.
- **Earth-first palette:** Warm beiges, olive accent and a terracotta primary keep the tone neighbourly and grounded.
- **Content-forward:** Cards recede slightly while product titles and pricing stay prominent with display-weight Nunito.
- **Built for tasks:** Inputs use inset surfaces to feel pressed-in and precise; buttons lift on interaction to signal affordance.
- **Light/dark harmony:** Both themes share the same elevation ladder and semantic tokens so status never drifts between modes.

## Colors

The palette is deliberately muted and warm, drawn from the beige/greige world with a single terracotta accent. Semantic tokens (success, warning, info, destructive) are defined in terms of their purpose and never diverge between light and dark.

### Primary
- **Revaro Terracotta** (#a86132): The accent for primary actions, CTAs and interactive affordances. Used sparingly to draw focus without shouting.

### Accent
- **Sage Olive** (#6b7c5e): A calming secondary accent used for trust indicators and supportive UI elements.

### Neutral
- **Ivory Canvas** (#eceae2): The base background across the app—warm and soft on the eyes.
- **Charcoal Soil** (#2e2a25): Primary text colour for high-contrast legibility.
- **Ash Taupe** (#82796d): Muted foreground for secondary text, metadata and hints.
- **Clay Border** (#d8d1c3): Subtly divides surfaces without creating harsh lines.
- **Warm Sand** (#f2efe7): Surface tone one step off background for panels needing a slight lift.
- **Oat Recess** (#e1ddd2): Recessed neutral for skeletons, tracks and inactive states.

### Semantic States
- **Success (Forest)** (#41603a): Indicates completed, confirmed or successful states with high contrast on backgrounds.
- **Warning (Mustard Clay)** (#8a5a12): Signals caution, pending or upcoming states.
- **Info (Steel Slate)** (#2f5f7a): Communicates informational or neutral-progress states.
- **Destructive (Rust)** (#b64032): Reserved for destructive actions; paired with its foreground token to avoid foreign hues.

### Named Rules

**The One Accent Rule.** The terracotta primary is the sole high-saturation action colour. Accent, neutrals and semantics carry the rest of the system—its restraint is part of the brand voice.

**The No-Neon Rule.** Saturation stays within the earth range. Status colours must meet ≥4.5:1 contrast against their background surfaces and never read as fluorescent.

## Typography

**Display Font:** Nunito (with sans-serif fallback)
**Body Font:** DM Sans (with sans-serif fallback)

**Character:** Nunito brings a friendly, confident weight to headings that feels neighbourly without sacrificing authority. DM Sans reads crisply at body sizes with excellent rhythm for product listings, forms and metadata.

### Hierarchy
- **Display** (900, clamp(3rem, 5vw, 4rem), line-height 1.06, -0.025em tracking): Used for hero headlines and major page titles where impact must be earned without shouting.
- **Headline** (900, 2.5rem, line-height 1.1, -0.025em tracking): Primary section headers that introduce new product categories or flows.
- **Title** (900, 1.65rem, line-height 1.15, -0.025em tracking): Subsection headers, modal titles and prominent labels.
- **Body** (400, 1rem, line-height 1.75): Default type for descriptions, form fields and UI copy. Readable at comfortable line lengths.
- **Label** (700, 0.75rem, line-height 1.2): Metadata, badges, chips and fine-print that needs to stand out while staying compact.

### Named Rules

**The Heading Authority Rule.** Headings use Nunito at 900 weight and tight tracking (-0.025em). This establishes a consistent typographic voice that scales from hero down to titles.

**The Legibility Rhythm Rule.** Body text maintains a 1.75 line-height and never drops below 16px; labels stay compact but never sacrifice readability.

## Layout

The layout system favors generous breathing room, predictable spacing (4pt-based progression: xs=4px through 3xl=40px) and responsive grid behavior. Product grids are density-aware, allowing cards to align cleanly across breakpoints without visual jitter. Key containers maintain consistent horizontal padding on mobile while expanding on larger screens.

**Behavior:** Content sits on the warm background; panels use surface tones only when a slight elevation distinction is needed. The spacing scale is applied consistently to padding, gaps and margins to maintain vertical rhythm.

## Elevation & Depth

Depth is conveyed through dual-shadow neumorphic pairs—never flat glows. Each elevation rung pairs a warm dark shadow with a complementary light shadow, allowing surfaces to read as lit from above without appearing overexposed.

### Shadow Vocabulary
- **elev-inset** (`inset 2px 2px 6px #c4bba7, inset -2px -2px 4px #faf7ef`): Used for pressed/active states and inset surfaces (inputs). Creates a tactile "pressed into the surface" feel.
- **elev-card** (`2px 2px 8px #c4bba7, -2px -2px 4px #faf7ef`): Resting elevation for product cards and panels. One rung down from raised to keep catalog grids composed and calm.
- **elev-card-hover** (`4px 4px 14px #c4bba7, -3px -3px 8px #faf7ef`): Lifts a card exactly one rung on hover/focus to provide clear affordance.
- **elev-raised** (`4px 4px 16px #c4bba7, -3px -3px 8px #faf7ef`): Used for sticky bars, panels and surfaces that need to sit above content.
- **elev-floating** (`3px 3px 12px #c4bba7, -2px -2px 6px #faf7ef`): Top rung, reserved for floating controls like docks and action elements.
- **elev-modal** (`0 12px 32px #c4bba7, 0 2px 8px #c4bba7`): Sheet/modal elevation; uses a single-direction drop for surfaces over scrims.
- **elev-sheet** (`0 -8px 28px #c4bba7, 0 -2px 6px #c4bba7`): Bottom-sheet specific elevation.
- **elev-drawer** (`-10px 0 32px #c4bba7, -2px 0 6px #c4bba7`): Side drawer elevation.

### Named Rules

**The One-Step Lift Rule.** Hover never jumps more than one elevation rung. Cards go from card to card-hover; controls follow the same disciplined ladder.

**The No-Bloom Rule.** Neumorphic light shadows are intentionally subdued to avoid the glowing/overexposed look. Depth comes from blur and opposition, not white halos.

**The Scrim Rule.** Surfaces rendered over overlays (modals, sheets, drawers) use a single drop shadow rather than the full dual-light pair to prevent bloom against the dimmed background.

## Shapes

The shape language is soft and friendly. Corners are generously rounded throughout—product cards use 28px, inputs/buttons use full pill shapes, and internal image containers use 20-22px. This creates a cohesive, approachable feel that aligns with the neighbour-to-neighbour positioning.

- **Cards:** `rounded-3xl` (28px) outer, with `rounded-[20px]`/`rounded-2xl` inner image wells for subtle nesting.
- **Inputs & Buttons:** `rounded-full` (pill) for a soft, tactile affordance.
- **Badges & Chips:** `rounded-full` to feel compact and friendly.
- **Modals/Sheets:** `rounded-[28px]` with appropriate edge treatment (top-rounded for sheets).
- **Floating elements:** `rounded-2xl` for dock-like controls.

## Components

### Buttons
- **Shape:** Fully rounded pill (9999px). 
- **Primary:** Terracotta background (#a86132) with warm cream text (#fff7ed). Subtle inset highlight at top edge for depth; lifts on hover, presses in on active (inset shadow). Used for the main action in a flow.
- **Secondary:** Soft neutral surface (#ded9cd) with charcoal text (#3a342d), elevated with card shadow. Used for supporting actions.
- **Ghost:** Transparent background, foreground text. Subtly tinted on hover (primary/10) for discoverability without visual weight.
- **Inset:** Pressed-surface variant using inset shadow and recessed background (#e3dfd5). Signals active/toggled state.
- **Destructive:** Red-tinted surface (destructive/12) with destructive text (#b64032) and soft border (destructive/40). Preserves warm surfaces while clearly signalling consequence.
- **States:** Smooth 180-200ms transitions for color/shadow; 120ms micro-transform on press. Focus uses primary ring with offset.

### Cards
- **Style:** `card-surface` with 1px raised border, ivory background (#eceae2), 28px radius and card-level elevation. 
- **Hover:** Lifts to `elev-card-hover` on interactive cards (product tiles) with a subtle translate-y (-1px) to reinforce affordance.
- **Internal Structure:** Often wrapped in an `inset-surface` container (20px radius) to frame imagery, creating gentle visual separation without extra borders.
- **Usage:** Product cards, panels, lists—any grouped content that benefits from tactile elevation.

### Inputs
- **Style:** `inset-surface` with recessed background (#e3dfd5), 1px inset border, 11px height, full radius, body text. 
- **Placeholder:** Muted foreground (#82796d).
- **Focus:** Primary ring (primary/50) with 2px width for clear keyboard focus. No background colour shift, preserving the pressed-in affordance.
- **States:** Disabled uses opacity-50; supports all standard input types.

### Badges
- **Style:** Pill-shaped, primary-tinted background (primary/10), primary text, bold label typography (10-11px scale). 
- **Usage:** Mode indicators, status chips, trust badges. Can be overlaid on imagery with background/90 for legibility against photo content.

### Modals (Dialog)
- **Surface:** `modal-surface` with background (#eceae2), 1px raised border, 28px radius, modal elevation over scrim. 
- **Behavior:** Radix Dialog provides focus trapping, Esc-to-close, aria-modal semantics. Close control is a soft-button icon in the top-right.
- **Structure:** Header (with title/description), scrollable content area, optional footer. Max width constrained with responsive viewport padding.

### Sheets (Bottom Sheet)
- **Surface:** `sheet-surface` with top-rounded 28px, sheet elevation, max height 88vh. 
- **Animation:** Spring-based slide-up/slide-down via Framer Motion; scrim fades in/out. 
- **Structure:** Header bar with title/description and close action, scrollable body, optional footer with top border.
- **Usage:** Mobile-first flows where a full modal would feel heavy.

### Navigation & Floating Elements
- **Floating Dock:** Translucent background (color-mix with 88% opacity), backdrop-blur(12px), raised border, floating elevation, 2xl radius. Provides persistent, legible actions without obscuring content.
- **Dividers:** Subtly graded horizontal rule (`neumo-divider`) using transparent → divider → transparent to avoid harsh solid lines.

### Named Rules

**The Recessed Input Rule.** Form fields feel pressed-in (inset surface) to distinguish them from elevated cards and clearly signal they accept input.

**The Lift-On-Interact Rule.** Interactive cards and primary actions lift on hover/focus and press in on active—providing consistent, predictable affordance across the system.

**The Soft Edge Rule.** Nesting uses progressively smaller radii (28px → 22px/20px) to create harmonious inner containers without breaking the pill/soft corner language.

## Do's and Don'ts

### Do
- **Do** use the dual-shadow neumorphic pairs as defined—never replace them with a single bright highlight or pure black shadow.
- **Do** keep primary actions restrained in number per screen. The terracotta accent earns its attention through scarcity.
- **Do** prefer inset surfaces for inputs and controls that are "pressed" or editable; use raised/card surfaces for content containers.
- **Do** maintain the elevation ladder discipline: hover lifts exactly one rung, never more.
- **Do** respect reduced motion (animations should respect `prefers-reduced-motion` where applicable).
- **Do** keep semantic status colours tied to their token names (`success`, `warning`, `info`, `destructive`) rather than raw palette values.

### Don't
- **Don't** introduce bright white glow or bloom effects—depth comes from the warm light/dark shadow pair.
- **Don't** use neon, high-chroma or cold/cyan tones. The palette stays in the warm earth range.
- **Don't** mix raw RGB color values for status states inline; always reference semantic tokens so light/dark modes stay in sync.
- **Don't** break the pill shape for inputs/buttons without a strong, documented reason. The fully-rounded form is a core part of the brand language.
- **Don't** overuse shadows. Flat-by-default at rest; elevation appears only in response to state or to denote layering.