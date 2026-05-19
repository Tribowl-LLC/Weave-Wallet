import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Fingerprint, Loader2, ArrowLeftRight } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { authenticatePasskey } from "@/lib/passkey";
import { formatUsd } from "@/lib/lightning";
import { Button } from "@/components/ui/button";

export default function Confirm() {
  const [, setLocation] = useLocation();
  const { credentialId, pendingInvoice, setPendingInvoice, unlocked } = useWalletStore();
  const [status, setStatus] = useState<"idle" | "authenticating" | "paying" | "success">("idle");
  const [selectedCoin, setSelectedCoin] = useState<"RUSD" | "USDI">("RUSD");

  useEffect(() => {
    if (!unlocked || !pendingInvoice) {
      setLocation("/home");
    }
  }, [unlocked, pendingInvoice, setLocation]);

  if (!pendingInvoice) return null;

  const handlePay = async () => {
    if (!credentialId) {
      // Fallback for demo mode
      processPayment();
      return;
    }

    setStatus("authenticating");
    try {
      await authenticatePasskey(credentialId);
      processPayment();
    } catch (err) {
      console.error(err);
      setStatus("idle");
    }
  };

  const processPayment = () => {
    setStatus("paying");
    
    // Simulate network delay
    setTimeout(() => {
      setStatus("success");
      
      // Auto dismiss after success
      setTimeout(() => {
        setPendingInvoice(null);
        setLocation("/home");
      }, 2000);
    }, 1500);
  };

  const formattedUsd = formatUsd(pendingInvoice.amountMsat);
  const fiberAmount = pendingInvoice.amountMsat * (110000 / 100000000000); // Same conversion to USD value

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col p-6 bg-background relative"
    >
      <div className="absolute top-1/4 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full z-10 pt-12">
        <AnimatePresence mode="wait">
          {status === "success" ? (
            <motion.div 
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(22,201,83,0.3)]">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Paid {formattedUsd}</h2>
              <p className="text-muted-foreground">Payment complete</p>
            </motion.div>
          ) : (
            <motion.div 
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <div className="text-center mb-10">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Pay Square Merchant</p>
                <div className="text-5xl font-bold tracking-tighter mb-4 text-foreground">
                  {formattedUsd}
                </div>
                {pendingInvoice.description && (
                  <p className="text-muted-foreground text-sm bg-muted/40 inline-block px-4 py-2 rounded-full">
                    {pendingInvoice.description}
                  </p>
                )}
              </div>

              <div className="space-y-4 mb-10">
                <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Pay with</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedCoin("RUSD")}
                      className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-between transition-all ${selectedCoin === "RUSD" ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"}`}
                    >
                      <span className="font-semibold">RUSD</span>
                      <span>{fiberAmount.toFixed(2)}</span>
                    </button>
                    <button 
                      onClick={() => setSelectedCoin("USDI")}
                      className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-between transition-all ${selectedCoin === "USDI" ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"}`}
                    >
                      <span className="font-semibold">USDI</span>
                      <span>{fiberAmount.toFixed(2)}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium py-2">
                  <span className="bg-muted px-2 py-1 rounded-md">Fiber</span>
                  <ArrowLeftRight className="w-3 h-3 opacity-50" />
                  <span className="bg-muted px-2 py-1 rounded-md">Lightning</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto pt-6 w-full max-w-sm mx-auto z-10 space-y-3">
        {status !== "success" && (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handlePay}
              disabled={status !== "idle"}
              className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-semibold text-lg shadow-[0_8px_30px_rgba(22,201,83,0.3)] flex items-center justify-center gap-3 disabled:opacity-70 disabled:shadow-none"
            >
              {status === "idle" ? (
                <>
                  <Fingerprint className="w-6 h-6" />
                  Pay with Face ID
                </>
              ) : (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  {status === "authenticating" ? "Authenticating..." : "Paying..."}
                </>
              )}
            </motion.button>
            <Button 
              variant="ghost" 
              className="w-full h-14 rounded-2xl text-muted-foreground"
              onClick={() => {
                setPendingInvoice(null);
                setLocation("/home");
              }}
              disabled={status !== "idle"}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
