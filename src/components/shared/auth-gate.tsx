import { motion } from "framer-motion";
import { Repeat2 } from "lucide-react";

/**
 * Shown while the initial session is being resolved so the app never flashes
 * the login page (or assumes logged-out) before auth state is known.
 */
export function AuthGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <span className="soft-button flex size-16 items-center justify-center rounded-3xl text-primary">
        <Repeat2 size={30} strokeWidth={2.5} />
      </span>
      <div
        className="inset-surface h-1.5 w-40 overflow-hidden rounded-full"
        role="status"
        aria-label="Checking your session"
      >
        <motion.div
          className="h-full w-1/3 rounded-full bg-primary/70"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
