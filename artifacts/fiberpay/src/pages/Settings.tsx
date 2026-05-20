import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Download, Shield, History, RefreshCcw, Network } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getFiberClient, reconnectFiber, switchToMockFiber } from "@/lib/fiber/client";
import { getFiberConnection, subscribeFiberConnection } from "@/lib/fiber/connection";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { reset, unlocked, setBalances } = useWalletStore();
  const { clearAll } = useActivityStore();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [connState, setConnState] = useState(getFiberConnection());

  useEffect(() => {
    return subscribeFiberConnection(setConnState);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      setLocation("/");
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [unlocked, setLocation]);

  const handleReset = () => {
    if (confirm("Are you sure? This will remove your wallet credential from this device.")) {
      reset();
      toast.success("Wallet reset successfully");
      setLocation("/");
    }
  };
  
  const handleClearActivity = () => {
    if (confirm("Clear all activity history?")) {
      clearAll();
      toast.success("Activity cleared");
    }
  };

  const handleResetBalances = async () => {
    localStorage.removeItem("fiberpay.balances.RUSD");
    localStorage.removeItem("fiberpay.balances.USDI");
    
    try {
      const client = getFiberClient();
      const fiberBalances = await client.getBalances();
      const newBals = {
        RUSD: fiberBalances.find(b => b.asset === "RUSD")?.amount.toString() || "0",
        USDI: fiberBalances.find(b => b.asset === "USDI")?.amount.toString() || "0",
      };
      setBalances(newBals);
      toast.success("Balances reset to defaults");
    } catch (e) {
      toast.error("Failed to refresh balances");
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      toast.success("App installed successfully");
    }
  };

  const handleReconnect = async () => {
    toast("Reconnecting...");
    await reconnectFiber();
  };

  if (!unlocked) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col p-6 bg-background"
    >
      <header className="flex items-center mb-8 mt-4 relative">
        <Link href="/home" className="w-10 h-10 absolute left-0 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight w-full text-center">Settings</h1>
      </header>

      <div className="space-y-6">
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
            <Network className="w-4 h-4" />
            Network
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${connState.status === 'connected' ? 'bg-green-500' : connState.status === 'connecting' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div className="font-medium text-sm">Mode</div>
              </div>
              <div className="text-sm font-medium bg-muted px-2 py-1 rounded-md">
                {connState.mode === "mock" ? "Mock (simulated)" : "Real Fiber"}
              </div>
            </div>
            
            {connState.mode === "real" && (
              <>
                <div className="px-2 space-y-1">
                  <div className="text-xs text-muted-foreground">Endpoint</div>
                  <div className="text-sm font-mono truncate">{connState.endpoint || "Unknown"}</div>
                </div>
                {connState.nodeInfo && (
                  <div className="px-2 space-y-1">
                    <div className="text-xs text-muted-foreground">Node ID • {connState.nodeInfo.network}</div>
                    <div className="text-xs font-mono truncate">{connState.nodeInfo.nodeId}</div>
                    <div className="text-xs text-muted-foreground mt-1">Channels: {connState.nodeInfo.channelCount} • Version: {connState.nodeInfo.version}</div>
                  </div>
                )}
              </>
            )}
            
            {connState.mode === "mock" && (
              <p className="text-xs text-muted-foreground px-2">Set VITE_FIBER_RPC_URL to connect to a real Fiber node.</p>
            )}

            {connState.mode === "real" && connState.status === "error" && connState.lastError && (
              <div className="px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                {connState.lastError}
              </div>
            )}

            <Button 
              variant="outline" 
              className="w-full h-12 rounded-xl mt-2"
              onClick={handleReconnect}
              disabled={connState.status === "connecting"}
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${connState.status === "connecting" ? "animate-spin" : ""}`} />
              Reconnect
            </Button>

            {connState.mode === "real" && connState.status === "error" && (
              <Button
                variant="ghost"
                className="w-full h-11 rounded-xl text-muted-foreground"
                onClick={() => { switchToMockFiber(); toast.success("Switched to simulated mode"); }}
              >
                Switch to simulated mode
              </Button>
            )}
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
            <History className="w-4 h-4" />
            Activity
          </div>

          
          <div className="space-y-2">
            <Link href="/activity" className="w-full justify-start h-14 rounded-xl flex items-center px-4 bg-muted/30 hover:bg-muted/50 transition-colors">
              <span>View full activity history</span>
            </Link>
            <Button 
              variant="ghost" 
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-14 rounded-xl"
              onClick={handleClearActivity}
            >
              <Trash2 className="w-5 h-5 mr-3" />
              Clear Activity History
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
            <Shield className="w-4 h-4" />
            Security
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 mb-2">
              <div>
                <div className="font-medium">Passkey Status</div>
                <div className="text-xs text-muted-foreground">Wallet is secured with biometrics</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(22,201,83,0.8)]" />
            </div>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-14 rounded-xl"
              onClick={handleReset}
            >
              <Trash2 className="w-5 h-5 mr-3" />
              Reset Wallet
            </Button>
          </div>
        </div>
        
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
            Developer
          </div>
          <Button 
            variant="outline" 
            className="w-full h-14 rounded-xl text-md"
            onClick={handleResetBalances}
          >
            <RefreshCcw className="w-5 h-5 mr-2" />
            Reset Balances
          </Button>
        </div>

        {deferredPrompt && (
          <div className="bg-card border border-border/50 rounded-2xl p-4">
             <div className="flex items-center gap-3 mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider px-2">
              <Download className="w-4 h-4" />
              App
            </div>
            <Button 
              className="w-full h-14 rounded-xl text-md"
              onClick={handleInstall}
            >
              Install App to Home Screen
            </Button>
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground pt-4 pb-4">
          <p>FiberPay Wallet v1.0.0</p>
          <p className="mt-1">Demo Mode • Client Side Only</p>
        </div>
      </div>
    </motion.div>
  );
}
