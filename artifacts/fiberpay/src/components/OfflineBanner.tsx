import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/useOnline";

// Slim banner that slides down from the top of the viewport whenever
// the browser reports it's offline. It sits above all routes (mounted
// once in App.tsx) so every screen gets the same treatment.
export default function OfflineBanner() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline"
          role="status"
          aria-live="polite"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 240 }}
          className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 text-black text-sm font-medium py-2 px-4 shadow-lg"
        >
          <WifiOff className="w-4 h-4" />
          <span>You're offline — payments will resume when you're back.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
