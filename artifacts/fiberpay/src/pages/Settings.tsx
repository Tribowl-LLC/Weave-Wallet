import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Download, Shield, History, RefreshCcw } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getFiberClient } from "@/lib/fiber/client";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { reset, unlocked, setBalances } = useWalletStore();
  const { clearAll } = useActivityStore();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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
