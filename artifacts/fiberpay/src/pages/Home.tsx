import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ScanLine, Settings, Activity, ArrowUpRight, ArrowDownLeft, ChevronRight, FlaskConical, Download, X, ClipboardCheck } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { getFiberClient } from "@/lib/fiber/client";
import { subscribeFiberConnection, getFiberConnection } from "@/lib/fiber/connection";
import { getAsset } from "@/lib/fiber/assets";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Home() {
  const [, setLocation] = useLocation();
  const { unlocked, hasOnboarded, balances, setBalances, selectedAsset, setSelectedAsset, installPromptDismissed, setInstallPromptDismissed, testReadyBannerDismissed, setTestReadyBannerDismissed } = useWalletStore();
  const { entries } = useActivityStore();
  const [isLoading, setIsLoading] = useState(false);
  const [connState, setConnState] = useState(getFiberConnection());
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Capture the install prompt event so we can offer the user a one-tap
  // "Add to Home Screen" inside our own UI (Android Chromium browsers).
  // iOS Safari never fires this; the dedicated iOS install hint lives in
  // Settings to keep Home uncluttered.
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    haptic.tap();
    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success("WeaveWallet installed");
      }
    } catch {
      // user dismissed or browser blocked
    } finally {
      setInstallPrompt(null);
    }
  };

  useEffect(() => {
    return subscribeFiberConnection(setConnState);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setLocation("/");
      return;
    }
    if (!hasOnboarded) {
      setLocation("/onboarding");
      return;
    }
    
    let isMounted = true;
    const fetchBalances = async () => {
      setIsLoading(true);
      try {
        const client = getFiberClient();
        const fiberBalances = await client.getBalances();
        if (isMounted) {
          const newBals = {
            RUSD: fiberBalances.find(b => b.asset === "RUSD")?.amount.toString() || "0",
            USDI: fiberBalances.find(b => b.asset === "USDI")?.amount.toString() || "0",
          };
          setBalances(newBals);
        }
      } catch (err) {
        console.error("Failed to fetch balances:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchBalances();
    
    return () => { isMounted = false; };
  }, [unlocked, hasOnboarded, setLocation, setBalances]);

  if (!unlocked) return null;

  const getFormattedBalance = (asset: "RUSD" | "USDI") => {
    if (!balances) return "$0.00";
    const amt = BigInt(balances[asset]);
    const decimals = getAsset(asset).decimals;
    const val = Number(amt) / (10 ** decimals);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);
  };

  const getUnformattedValue = (asset: "RUSD" | "USDI") => {
    if (!balances) return "0.00";
    const amt = BigInt(balances[asset]);
    const decimals = getAsset(asset).decimals;
    const val = Number(amt) / (10 ** decimals);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const selectedBalanceStr = getFormattedBalance(selectedAsset);
  const otherAsset = selectedAsset === "RUSD" ? "USDI" : "RUSD";
  const otherBalanceStr = getUnformattedValue(otherAsset);

  const recentEntries = entries.slice(0, 3);
  
  const connColor = connState.status === "connected" ? "bg-green-500" : connState.status === "connecting" ? "bg-amber-500" : "bg-red-500";

  // Surface "Test Mode" prominently whenever we're using simulated
  // balances/payments OR any recent payment has an unverified LN leg.
  const hasUnverifiedLn = entries.slice(0, 5).some(e => e.lightningStatus === "unknown" || e.lightningStatus === "pending");
  const showTestModeBanner = connState.mode === "mock";
  const showInstallBanner = !!installPrompt && !installPromptDismissed;
  // Surface the "Ready to test" prompt only once the user has done the
  // hard work (real node, healthy connection) but hasn't dismissed it.
  // It's the bridge between "I configured everything" and "I should
  // actually try a payment with my own real money".
  const showTestReadyBanner =
    connState.mode === "real" &&
    connState.status === "connected" &&
    !testReadyBannerDismissed;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col p-6 bg-background"
    >
      <header className="flex justify-between items-start mb-8 mt-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            WeaveWallet
            <Link href="/settings" aria-label="Open settings">
              <div className={`w-2 h-2 rounded-full ${connColor} shadow-sm opacity-80 cursor-pointer hover:opacity-100 transition-opacity`} />
            </Link>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 tracking-wide">
            Scan Lightning · Pay with Stablecoin
          </p>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </header>

      {showTestModeBanner && (
        <div
          onClick={() => setLocation("/settings")}
          className="mb-4 flex items-center gap-3 bg-amber-400/10 border border-amber-400/30 rounded-2xl p-3 cursor-pointer hover:bg-amber-400/15 transition-colors"
          role="button"
          aria-label="Test mode active. Open Settings to connect your node."
        >
          <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-400">Test mode</div>
            <div className="text-xs text-muted-foreground truncate">Simulated payments. Tap to connect your Fiber node.</div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400/70 shrink-0" />
        </div>
      )}

      {hasUnverifiedLn && !showTestModeBanner && (
        <div
          onClick={() => setLocation("/activity")}
          className="mb-4 flex items-center gap-3 bg-amber-400/10 border border-amber-400/30 rounded-2xl p-3 cursor-pointer hover:bg-amber-400/15 transition-colors"
          role="button"
          aria-label="A recent payment has an unverified Lightning leg. Open activity."
        >
          <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-400">Lightning leg unverified</div>
            <div className="text-xs text-muted-foreground truncate">A recent payment is pending confirmation. Tap to review.</div>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400/70 shrink-0" />
        </div>
      )}

      {showTestReadyBanner && (
        <div className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-2xl p-3">
          <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-primary">Ready to test with real funds?</div>
            <div className="text-xs text-muted-foreground truncate">Step-by-step checklist for your first real payment.</div>
          </div>
          <Link
            href="/help"
            onClick={() => haptic.tap()}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Open
          </Link>
          <button
            onClick={() => { setTestReadyBannerDismissed(true); }}
            aria-label="Dismiss testing checklist prompt"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/40 text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showInstallBanner && (
        <div className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-2xl p-3">
          <Download className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-primary">Install WeaveWallet</div>
            <div className="text-xs text-muted-foreground truncate">Add to your home screen for one-tap access.</div>
          </div>
          <button
            onClick={handleInstall}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => { setInstallPromptDismissed(true); }}
            aria-label="Dismiss install prompt"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/40 text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!bannerDismissed && connState.mode === "real" && connState.status === "error" && (
        <div 
          onClick={() => setLocation("/settings")}
          className="mb-6 bg-card border border-border/50 border-l-4 border-l-red-500/80 rounded-2xl p-4 shadow-sm cursor-pointer hover:bg-card/80 transition-colors relative"
        >
          <button 
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
            onClick={(e) => { e.stopPropagation(); setBannerDismissed(true); }}
          >
            <span className="sr-only">Dismiss</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <h3 className="font-semibold text-foreground text-sm pr-6">Your Fiber node isn't reachable</h3>
          <p className="text-muted-foreground text-xs mt-1">WeaveWallet needs a running node to send real payments. Tap to connect.</p>
        </div>
      )}

      <div className="relative mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-xl" />
        <div className="relative bg-card border border-border/50 rounded-3xl p-6 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 0L100 25V75L50 100L0 75V25L50 0Z" fill="currentColor"/>
            </svg>
          </div>
          
          <div className="flex justify-between items-center mb-2">
            <div className="text-muted-foreground font-medium text-sm">Total Balance</div>
            <div className="flex bg-muted/50 rounded-full p-1 border border-border/50">
              <button 
                onClick={() => setSelectedAsset("RUSD")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${selectedAsset === "RUSD" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                RUSD
              </button>
              <button 
                onClick={() => setSelectedAsset("USDI")}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${selectedAsset === "USDI" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                USDI
              </button>
            </div>
          </div>
          
          {isLoading && !balances ? (
            <div className="space-y-2 mt-2">
              <Skeleton className="h-10 w-48 rounded-lg" />
              <Skeleton className="h-5 w-32 rounded-md" />
            </div>
          ) : (
            <>
              <div className="text-4xl font-bold tracking-tight mb-1 text-foreground">
                {selectedBalanceStr} 
                <span className="text-xl font-semibold ml-2" style={{ color: getAsset(selectedAsset).iconColor }}>
                  {selectedAsset}
                </span>
              </div>
              <div className="text-muted-foreground font-medium flex items-center gap-2">
                {otherBalanceStr} {otherAsset}
              </div>
            </>
          )}

          <div className="flex gap-3 mt-8">
            <Button variant="secondary" className="flex-1 rounded-xl h-12 bg-secondary/50 hover:bg-secondary/80">
              <ArrowDownLeft className="w-4 h-4 mr-2" />
              Receive
            </Button>
            <Button variant="secondary" className="flex-1 rounded-xl h-12 bg-secondary/50 hover:bg-secondary/80">
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setLocation("/scan")}
        className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-semibold text-lg shadow-[0_8px_30px_rgba(22,201,83,0.3)] flex items-center justify-center gap-3 mb-8"
      >
        <ScanLine className="w-6 h-6" />
        Scan to Pay
      </motion.button>

      <div className="flex-1">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          {entries.length > 0 && (
            <Link href="/activity" className="text-sm font-medium text-primary flex items-center">
              See all <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          )}
        </div>
        
        {entries.length === 0 ? (
          <div className="bg-card/30 border border-border/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium text-sm">No recent transactions</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Scan a Lightning invoice to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentEntries.map(entry => (
              <Link key={entry.id} href="/activity">
                <div className="flex items-center justify-between p-4 bg-card/50 border border-border/50 rounded-2xl hover:bg-card/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${
                      entry.status === 'settled' ? 'bg-primary shadow-[0_0_8px_rgba(22,201,83,0.8)]' : 
                      entry.status === 'failed' ? 'bg-red-400' : 
                      'bg-amber-400'
                    }`} />
                    <div>
                      <div className="font-medium text-sm text-foreground">{entry.description || "Lightning Payment"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">-{entry.amount} {entry.asset}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(entry.amountUsd)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
