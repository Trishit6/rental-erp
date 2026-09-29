import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-context";
import type { ThemePreference } from "./theme-types";

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Compact navbar theme control — cycles light → dark → system.
 * Icon-only but fully labelled for accessibility.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, setTheme } = useTheme();
  const Icon = ICONS[preference];
  const next = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next]}`}
      title={`Theme: ${LABELS[preference]} — click for ${LABELS[next]}`}
      className={`soft-button flex size-10 items-center justify-center rounded-full text-foreground transition hover:text-primary ${className}`}
    >
      <motion.span
        key={preference}
        initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex"
      >
        <Icon size={17} />
      </motion.span>
    </button>
  );
}
