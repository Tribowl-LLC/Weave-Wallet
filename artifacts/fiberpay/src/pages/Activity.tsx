import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Activity, Copy, Check, Download } from "lucide-react";
import { useActivityStore } from "@/store/activity";
import { getAsset } from "@/lib/fiber/assets";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { exportActivityAsCsv, exportActivityAsJson } from "@/lib/exportActivity";

function CopyButton({ text, label = "Value" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Surface the failure instead of leaving the user wondering why
      // nothing happened (Safari can block clipboard outside user gestures
      // in some contexts).
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className="p-2 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export default function ActivityPage() {
  const { entries } = useActivityStore();
  const [, setLocation] = useLocation();

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen flex flex-col bg-background"
    >
      <header className="flex items-center p-6 pb-2 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Link
          href="/home"
          aria-label="Back to home"
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground -ml-2 mr-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight flex-1">Activity</h1>
        {entries.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Export activity"
                onClick={() => haptic.tap()}
                className="w-10 h-10 rounded-full text-muted-foreground hover:text-foreground focus:ring-2 focus:ring-primary/40"
              >
                <Download className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border/60">
              <DropdownMenuItem
                onClick={() => {
                  exportActivityAsCsv(entries);
                  toast.success(`Exported ${entries.length} ${entries.length === 1 ? "entry" : "entries"} as CSV`);
                }}
              >
                Download CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  exportActivityAsJson(entries);
                  toast.success(`Exported ${entries.length} ${entries.length === 1 ? "entry" : "entries"} as JSON`);
                }}
              >
                Download JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div className="flex-1 p-6 pt-4">
        {entries.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">It's quiet here</h3>
            <p className="text-muted-foreground text-sm max-w-[250px]">Your transaction history will appear here once you make your first payment.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-safe">
            {entries.map(entry => (
              <Drawer key={entry.id}>
                <DrawerTrigger asChild>
                  <div className="flex items-center justify-between p-4 bg-card/40 border border-border/40 rounded-2xl hover:bg-card/80 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        entry.status === 'settled' ? 'bg-primary shadow-[0_0_8px_rgba(22,201,83,0.8)]' : 
                        entry.status === 'failed' ? 'bg-red-400' : 
                        'bg-amber-400 animate-pulse'
                      }`} />
                      <div>
                        <div className="font-medium text-sm text-foreground">{entry.description || "Lightning Payment"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {entry.status === 'failed' && <span className="text-red-400 font-medium">Failed</span>}
                          {entry.status === 'pending' && <span className="text-amber-400 font-medium">Pending</span>}
                          {entry.status === 'settled' && entry.lightningStatus === 'pending' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-400 font-medium">LN pending</span>
                          )}
                          {entry.status === 'settled' && entry.lightningStatus === 'failed' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium">LN failed</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">
                        <span style={{ color: getAsset(entry.asset).iconColor }}>-{entry.amount}</span> {entry.asset}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(entry.amountUsd)}
                      </div>
                    </div>
                  </div>
                </DrawerTrigger>
                <DrawerContent className="bg-card border-border/50">
                  <DrawerHeader className="text-left pb-2">
                    <DrawerTitle className="text-xl">Transaction Details</DrawerTitle>
                    <DrawerDescription>
                      Created {new Date(entry.createdAt).toLocaleString()}
                      {entry.settledAt && (
                        <> · Settled {new Date(entry.settledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>
                      )}
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="p-4 space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/50">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Amount</div>
                        <div className="text-2xl font-bold">
                          {entry.amount} <span className="text-lg text-primary">{entry.asset}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(entry.amountUsd)}
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        entry.status === 'settled' ? 'bg-primary/20 text-primary' : 
                        entry.status === 'failed' ? 'bg-red-400/20 text-red-400' : 
                        'bg-amber-400/20 text-amber-400'
                      }`}>
                        {entry.status.toUpperCase()}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Fiber leg</div>
                      <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Payment ID</span>
                        <span className="font-mono text-xs truncate max-w-[180px]">{entry.id}</span>
                      </div>
                      {entry.fiberTxHash && (
                        <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                          <span className="text-muted-foreground">Fiber Tx</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs truncate max-w-[150px]">{entry.fiberTxHash}</span>
                            <CopyButton text={entry.fiberTxHash} />
                          </div>
                        </div>
                      )}
                      {entry.errorMessage && (
                        <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                          <span className="text-muted-foreground">Error</span>
                          <div className="text-right max-w-[200px]">
                            <div className="text-red-400">{entry.errorMessage}</div>
                            {entry.errorCode && (
                              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{entry.errorCode}</div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3">Lightning leg</div>
                      {entry.lightningStatus && (
                        <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                          <span className="text-muted-foreground">Status</span>
                          <span className={`text-right max-w-[200px] font-medium ${
                            entry.lightningStatus === 'settled' ? 'text-primary' :
                            entry.lightningStatus === 'failed' ? 'text-amber-500' :
                            entry.lightningStatus === 'unknown' ? 'text-muted-foreground' :
                            'text-amber-400'
                          }`}>
                            {entry.lightningStatus === 'settled' ? 'Settled' :
                             entry.lightningStatus === 'pending' ? 'Pending confirmation' :
                             entry.lightningStatus === 'failed' ? (entry.lightningError || 'Failed') :
                             entry.lightningError ? `Unverified: ${entry.lightningError}` : 'Unverified'}
                          </span>
                        </div>
                      )}
                      {entry.preimage && (
                        <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                          <span className="text-muted-foreground">Preimage</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs truncate max-w-[150px]">{entry.preimage}</span>
                            <CopyButton text={entry.preimage} />
                          </div>
                        </div>
                      )}
                      {entry.lightningPaymentHash && (
                        <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                          <span className="text-muted-foreground">Payment hash</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs truncate max-w-[150px]">{entry.lightningPaymentHash}</span>
                            <CopyButton text={entry.lightningPaymentHash} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm py-2 border-b border-border/30">
                        <span className="text-muted-foreground">Original Invoice</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs truncate max-w-[150px]">{entry.lightningInvoice}</span>
                          <CopyButton text={entry.lightningInvoice} />
                        </div>
                      </div>
                    </div>
                  </div>
                </DrawerContent>
              </Drawer>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
