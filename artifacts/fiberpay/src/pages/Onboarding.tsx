import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Zap, Fingerprint, ArrowRight, CheckCircle2, FlaskConical, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletStore } from "@/store/wallet";
import { switchToMockFiber, switchToRealFiber } from "@/lib/fiber/client";
import { haptic } from "@/lib/haptics";

type Step = "intro" | "node" | "mode" | "done";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { setHasOnboarded, unlocked } = useWalletStore();
  const [step, setStep] = useState<Step>("intro");

  // Guard in an effect, not a render-time side effect, to avoid React
  // warnings and the brief flash architect flagged.
  useEffect(() => {
    if (!unlocked) setLocation("/");
  }, [unlocked, setLocation]);

  if (!unlocked) return null;

  const next = (s: Step) => {
    haptic.tap();
    setStep(s);
  };

  const finish = (mode: "real" | "mock") => {
    haptic.success();
    if (mode === "mock") {
      switchToMockFiber();
    } else {
      switchToRealFiber();
    }
    setHasOnboarded(true);
    setLocation(mode === "real" ? "/settings" : "/home");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-6 bg-background relative overflow-hidden"
    >
      <div className="absolute top-1/3 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 mt-6 mb-10 z-10">
        {(["intro", "node", "mode"] as Step[]).map((s, i) => {
          const order: Step[] = ["intro", "node", "mode"];
          const currentIdx = order.indexOf(step);
          const isActive = i <= currentIdx;
          return (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${isActive ? "bg-primary w-10" : "bg-muted w-6"}`}
            />
          );
        })}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full z-10">
        <AnimatePresence mode="wait">
          {step === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-primary/15 text-primary flex items-center justify-center mb-6 border border-primary/20">
                <Zap className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Welcome to FiberPay</h2>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Pay any Lightning invoice with Fiber stablecoins (RUSD or USDI), straight from a node you control.
              </p>
              <ul className="w-full space-y-3 text-left">
                <li className="flex items-start gap-3 p-3 bg-card/50 border border-border/40 rounded-xl">
                  <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Non-custodial</div>
                    <div className="text-xs text-muted-foreground">Your node holds your keys, not us.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-3 bg-card/50 border border-border/40 rounded-xl">
                  <Fingerprint className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Passkey-gated</div>
                    <div className="text-xs text-muted-foreground">Every payment confirmed by biometrics.</div>
                  </div>
                </li>
              </ul>
            </motion.div>
          )}

          {step === "node" && (
            <motion.div
              key="node"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-20 h-20 rounded-3xl bg-primary/15 text-primary flex items-center justify-center mb-6 border border-primary/20">
                <Server className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-3">Run your own Fiber node</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                FiberPay talks directly to a Fiber node you operate — so you stay in control of your funds and the bridge.
              </p>
              <div className="w-full bg-card border border-border/50 rounded-2xl p-4 text-left space-y-3 mb-6">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Typical setup</div>
                <ol className="space-y-2 text-sm">
                  <li className="flex gap-2"><span className="text-primary font-mono">1.</span>Install the fnn node (Docker image or binary).</li>
                  <li className="flex gap-2"><span className="text-primary font-mono">2.</span>Fund a channel with RUSD or USDI.</li>
                  <li className="flex gap-2"><span className="text-primary font-mono">3.</span>Expose the JSON-RPC endpoint to this device.</li>
                  <li className="flex gap-2"><span className="text-primary font-mono">4.</span>Paste the URL into Settings on the next screen.</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground">
                The wallet just submits payment intents — your node does the signing, routing, and Lightning fulfillment.
              </p>
            </motion.div>
          )}

          {step === "mode" && (
            <motion.div
              key="mode"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center text-center w-full"
            >
              <div className="w-20 h-20 rounded-3xl bg-primary/15 text-primary flex items-center justify-center mb-6 border border-primary/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-3">How do you want to start?</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                You can connect to your real node now, or try the wallet end-to-end in test mode with simulated payments.
              </p>

              <button
                onClick={() => finish("real")}
                className="w-full text-left p-5 bg-card border border-primary/30 hover:border-primary/60 rounded-2xl mb-3 transition-colors group focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex items-center gap-3 mb-1">
                  <Server className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Connect to my node</span>
                </div>
                <p className="text-sm text-muted-foreground">Opens Settings so you can paste your RPC URL and test the connection.</p>
              </button>

              <button
                onClick={() => finish("mock")}
                className="w-full text-left p-5 bg-card/50 border border-border/50 hover:border-border rounded-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              >
                <div className="flex items-center gap-3 mb-1">
                  <FlaskConical className="w-5 h-5 text-amber-400" />
                  <span className="font-semibold">Try test mode</span>
                </div>
                <p className="text-sm text-muted-foreground">Simulated balances and payments. Great for a hardware-QR dry run. Switch anytime in Settings.</p>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {step !== "mode" && (
        <div className="mt-auto pt-6 w-full max-w-sm mx-auto z-10">
          <Button
            onClick={() => next(step === "intro" ? "node" : "mode")}
            className="w-full h-14 rounded-2xl text-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgba(22,201,83,0.25)]"
          >
            Continue <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}
