import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Fingerprint, Loader2, ArrowLeftRight, XCircle } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { authenticatePasskey } from "@/lib/passkey";
import { formatUsd } from "@/lib/lightning";
import { getFiberClient, FiberError } from "@/lib/fiber/client";
import { getAsset } from "@/lib/fiber/assets";
import type { PaymentStage } from "@/lib/fiber/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Confirm() {
  const [, setLocation] = useLocation();
  const { credentialId, pendingInvoice, setPendingInvoice, unlocked, balances, setBalances } = useWalletStore();
  const { addEntry, updateEntry } = useActivityStore();
  
  const [stage, setStage] = useState<PaymentStage>("idle");
  const [stageDetail, setStageDetail] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [isSwitchingAsset, setIsSwitchingAsset] = useState(false);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  useEffect(() => {
    if (!unlocked || !pendingInvoice) {
      setLocation("/home");
    }
  }, [unlocked, pendingInvoice, setLocation]);

  useEffect(() => {
    if (balances !== null) return;
    let cancelled = false;
    setIsLoadingBalances(true);
    (async () => {
      try {
        const fiberBalances = await getFiberClient().getBalances();
        if (cancelled) return;
        setBalances({
          RUSD: fiberBalances.find(b => b.asset === "RUSD")?.amount.toString() || "0",
          USDI: fiberBalances.find(b => b.asset === "USDI")?.amount.toString() || "0",
        });
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      } finally {
        if (!cancelled) setIsLoadingBalances(false);
      }
    })();
    return () => { cancelled = true; };
  }, [balances, setBalances]);

  const refreshBalances = async () => {
    try {
      const fiberBalances = await getFiberClient().getBalances();
      setBalances({
        RUSD: fiberBalances.find(b => b.asset === "RUSD")?.amount.toString() || "0",
        USDI: fiberBalances.find(b => b.asset === "USDI")?.amount.toString() || "0",
      });
    } catch (err) {
      console.error("Failed to refresh balances:", err);
    }
  };

  if (!pendingInvoice) return null;

  const currentAsset = pendingInvoice.fiber.asset;
  const assetInfo = getAsset(currentAsset);
  
  const formattedUsd = formatUsd(pendingInvoice.lightning.amountMsat);
  const fiberAmountFormatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(Number(pendingInvoice.fiber.amount) / (10 ** assetInfo.decimals));

  const balancesKnown = balances !== null;
  const currentBalance = balances ? balances[currentAsset] : "0";
  const hasEnoughBalance = balancesKnown && BigInt(currentBalance) >= pendingInvoice.fiber.amount;
  const canPay = balancesKnown && hasEnoughBalance;

  const handleAssetSwitch = async (newAsset: "RUSD" | "USDI") => {
    if (newAsset === currentAsset || isSwitchingAsset || stage !== "idle") return;
    setIsSwitchingAsset(true);
    
    try {
      const client = getFiberClient();
      const newFiberInvoice = await client.createInvoiceFromLightning({
        lightningInvoice: pendingInvoice.lightning.paymentRequest,
        amountMsat: pendingInvoice.lightning.amountMsat,
        description: pendingInvoice.lightning.description,
        asset: newAsset,
      });
      
      setPendingInvoice({
        ...pendingInvoice,
        fiber: newFiberInvoice
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to switch asset");
    } finally {
      setIsSwitchingAsset(false);
    }
  };

  const handlePay = async () => {
    if (!canPay) return;
    
    setStage("authenticating");
    setStageDetail("Waiting for Face ID...");
    
    try {
      let authSig = "mock_sig";
      if (credentialId) {
        await authenticatePasskey(credentialId);
        authSig = "real_sig";
      }
      
      setStage("creating_invoice");
      
      // Pre-create entry
      const activityId = "pend_" + crypto.randomUUID();
      addEntry({
        id: activityId,
        status: "pending",
        asset: pendingInvoice.fiber.asset,
        amount: fiberAmountFormatted,
        amountUsd: pendingInvoice.fiber.amountUsd,
        description: pendingInvoice.lightning.description || "Lightning Payment",
        lightningInvoice: pendingInvoice.lightning.paymentRequest,
        createdAt: Date.now(),
      });

      const client = getFiberClient();
      
      const unsub = client.onStage?.((s, d) => {
        setStage(s);
        if (d) setStageDetail(d);
      });
      
      try {
        const result = await client.sendPayment({
          invoice: pendingInvoice.fiber,
          signedAuthorization: authSig
        });
        
        updateEntry(activityId, {
          id: result.paymentId,
          status: "settled",
          fiberTxHash: result.fiberTxHash,
          preimage: result.preimage,
          settledAt: result.settledAt,
        });
        
        setStage("settled");
        setStageDetail("Payment complete");
        refreshBalances();
        
        setTimeout(() => {
          setPendingInvoice(null);
          setLocation("/home");
        }, 2500);
        
      } catch (err: any) {
        updateEntry(activityId, {
          status: "failed",
          errorCode: err instanceof FiberError ? err.code : "unknown",
          errorMessage: err.message || "Payment failed",
        });
        
        setStage("failed");
        setErrorMsg(err.message || "Payment failed");
      } finally {
        unsub?.();
      }
      
    } catch (err) {
      console.error(err);
      toast.error("Authentication failed");
      setStage("idle");
    }
  };

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
          {stage === "settled" ? (
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
              <p className="text-muted-foreground font-medium mb-1">in {currentAsset}</p>
              <p className="text-xs text-muted-foreground/60 font-mono">Fiber tx {pendingInvoice.fiber.paymentHash.slice(0, 10)}...</p>
            </motion.div>
          ) : stage === "failed" ? (
            <motion.div 
              key="failed"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center bg-card border border-destructive/20 p-8 rounded-3xl"
            >
              <div className="w-16 h-16 bg-destructive/20 text-destructive rounded-full flex items-center justify-center mb-6">
                <XCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold mb-2 text-foreground">Payment Failed</h2>
              <p className="text-muted-foreground text-sm mb-8">{errorMsg}</p>
              
              <Button 
                onClick={() => { setStage("idle"); setErrorMsg(null); }} 
                className="w-full h-12 rounded-xl mb-3"
              >
                Try Again
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => { setPendingInvoice(null); setLocation("/home"); }} 
                className="w-full h-12 rounded-xl text-muted-foreground"
              >
                Cancel
              </Button>
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
                {pendingInvoice.lightning.description && (
                  <p className="text-muted-foreground text-sm bg-muted/40 inline-block px-4 py-2 rounded-full">
                    {pendingInvoice.lightning.description}
                  </p>
                )}
              </div>

              <div className="space-y-4 mb-10">
                <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Pay with</span>
                    {!balancesKnown ? (
                      <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading balance...
                      </span>
                    ) : (
                      <span className={`font-medium ${hasEnoughBalance ? "text-muted-foreground" : "text-destructive"}`}>
                        Avail: {new Intl.NumberFormat('en-US').format(Number(currentBalance) / (10 ** assetInfo.decimals))} {currentAsset}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAssetSwitch("RUSD")}
                      disabled={stage !== "idle" || isSwitchingAsset}
                      className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-between transition-all ${currentAsset === "RUSD" ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"} disabled:opacity-50`}
                    >
                      <span className="font-semibold flex items-center">
                        RUSD {isSwitchingAsset && currentAsset !== "RUSD" && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}
                      </span>
                      <span>{currentAsset === "RUSD" ? fiberAmountFormatted : "..."}</span>
                    </button>
                    <button 
                      onClick={() => handleAssetSwitch("USDI")}
                      disabled={stage !== "idle" || isSwitchingAsset}
                      className={`flex-1 py-3 px-4 rounded-xl border flex items-center justify-between transition-all ${currentAsset === "USDI" ? "bg-[#38bdf8]/10 border-[#38bdf8] text-[#38bdf8]" : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50"} disabled:opacity-50`}
                    >
                      <span className="font-semibold flex items-center">
                        USDI {isSwitchingAsset && currentAsset !== "USDI" && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}
                      </span>
                      <span>{currentAsset === "USDI" ? fiberAmountFormatted : "..."}</span>
                    </button>
                  </div>
                  {balancesKnown && !hasEnoughBalance && (
                    <div className="text-destructive text-sm text-center font-medium py-1">
                      Insufficient {currentAsset} balance
                    </div>
                  )}
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
        {stage !== "settled" && stage !== "failed" && (
          <>
            <motion.button
              whileTap={stage === "idle" && canPay ? { scale: 0.97 } : undefined}
              onClick={handlePay}
              disabled={stage !== "idle" || !canPay || isSwitchingAsset || isLoadingBalances}
              className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-semibold text-lg shadow-[0_8px_30px_rgba(22,201,83,0.3)] flex items-center justify-center gap-3 disabled:opacity-70 disabled:shadow-none transition-all"
            >
              {stage === "idle" ? (
                isLoadingBalances && !balancesKnown ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Loading balance...
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-6 h-6" />
                    Pay with Face ID
                  </>
                )
              ) : (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <div className="flex flex-col items-start text-left">
                    <span>{stage === "routing" ? "Routing payment..." : stage === "settling" ? "Settling Lightning..." : "Processing..."}</span>
                    {stageDetail && <span className="text-xs opacity-80 font-normal">{stageDetail}</span>}
                  </div>
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
              disabled={stage !== "idle"}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
