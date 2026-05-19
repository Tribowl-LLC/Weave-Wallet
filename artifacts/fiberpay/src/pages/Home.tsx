import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ScanLine, Settings, Activity, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [, setLocation] = useLocation();
  const { unlocked } = useWalletStore();

  useEffect(() => {
    if (!unlocked) {
      setLocation("/");
    }
  }, [unlocked, setLocation]);

  if (!unlocked) return null;

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
          
          <div className="mb-2 text-muted-foreground font-medium text-sm">Total Balance</div>
          <div className="text-4xl font-bold tracking-tight mb-1 text-foreground">
            $1,284.50 <span className="text-xl text-primary font-semibold ml-1">RUSD</span>
          </div>
          <div className="text-muted-foreground font-medium flex items-center gap-2">
            12,840 USDI
          </div>

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
        </div>
        
        <div className="bg-card/30 border border-border/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <Activity className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium text-sm">No recent transactions</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Scan a Lightning invoice to get started</p>
        </div>
      </div>
    </motion.div>
  );
}
