import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

/**
 * Shared visual container for login, registration and future auth screens.
 * Keeps the neumorphic card + fade/slide entrance consistent across pages.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full"
    >
      <Card className="w-full p-6 sm:p-7">{children}</Card>
    </motion.div>
  );
}
