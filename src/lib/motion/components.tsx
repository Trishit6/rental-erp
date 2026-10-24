import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { fadeUp, transitions } from "./variants";

export function Reveal({
  children,
  className,
  once = true,
  margin = "-10%",
}: {
  children: React.ReactNode;
  className?: string;
  once?: boolean;
  margin?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once, margin: margin as any }}
      transition={transitions.normal}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial="initial"
      whileInView={prefersReducedMotion ? undefined : "animate"}
      viewport={{ once: true, margin: "-10%" }}
      variants={prefersReducedMotion ? {} : { animate: { transition: { staggerChildren: 0.05 } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      variants={prefersReducedMotion ? { initial: { opacity: 1 }, animate: { opacity: 1 } } : fadeUp}
      transition={transitions.normal}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PressableCard({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
      transition={transitions.fast}
      className={className}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({
  value,
  format = "integer",
  className,
}: {
  value: number;
  format?: "integer" | "inr";
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(prefersReducedMotion ? value : 0);
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion || started) {
      // One frame later, not synchronously in the effect: a value change while
      // visible still lands on the next paint, and a cascading render in the
      // commit phase never happens.
      const frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStarted(true);
          const duration = 400;
          const start = Date.now();
          const from = 0;
          const to = value;
          const step = () => {
            const t = Math.min(1, (Date.now() - start) / duration);
            const cur = Math.round(from + (to - from) * t);
            setDisplay(cur);
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, prefersReducedMotion, started]);

  const formatted = format === "inr" ? `₹${display.toLocaleString("en-IN")}` : display.toLocaleString("en-IN");
  return (
    <span ref={ref} className={className}>
      {formatted}
    </span>
  );
}

export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ImageReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SharedUnderline({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  if (!active) return null;
  return (
    <motion.span
      layoutId={prefersReducedMotion ? undefined : "nav-underline"}
      className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-primary"
      transition={transitions.fast}
    />
  );
}

export function CollapsibleHeight({ open, children }: { open: boolean; children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : transitions.normal}
      style={{ overflow: "hidden" }}
    >
      {children}
    </motion.div>
  );
}

export function ListItemPresence({ children, className }: { children: React.ReactNode; className?: string }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
      transition={transitions.fast}
      className={className}
    >
      {children}
    </motion.div>
  );
}
