import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ScanLine, Settings, Activity, ArrowUpRight, ArrowDownLeft, ChevronRight } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { getFiberClient } from "@/lib/fiber/client";
import { getAsset } from "@/lib/fiber/assets";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [, setLocation] = useLocation();
  const { unlocked, balances, setBalances, selectedAsset, setSelectedAsset } = useWalletStore();
  const { entries } = useActivityStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!unlocked) {
      setLocation("/");
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
  }, [unlocked, setLocation, setBalances]);

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

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col p-6 bg-background"
    >
      <header className="flex justify-between items-center mb-8 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Wallet</h1>
        <Link href="/settings" className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors">
          <Settings className="w-5 h-5" />
        </Link>
      </header>

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
