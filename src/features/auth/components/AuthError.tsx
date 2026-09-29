import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";

/**
 * Displays server authentication errors (invalid credentials, duplicate email,
 * network failures). Never exposes backend internals — pass an already-safe
 * message from the API error envelope.
 */
export function AuthError({ message }: { message?: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
