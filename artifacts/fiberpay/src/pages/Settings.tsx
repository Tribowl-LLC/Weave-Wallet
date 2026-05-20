import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Download, Shield, History, RefreshCcw, Network, Eye, EyeOff, Server, CheckCircle2, XCircle, Info } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useActivityStore } from "@/store/activity";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getFiberClient, reconnectFiber, switchToMockFiber, switchToRealFiber, updateFiberConfig, testFiberConnection } from "@/lib/fiber/client";
import { getFiberConnection, subscribeFiberConnection } from "@/lib/fiber/connection";

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

export default function Settings() {
  const [, setLocation] = useLocation();
  const { reset, unlocked, setBalances, fiberConfig } = useWalletStore();
  const { clearAll } = useActivityStore();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [connState, setConnState] = useState(getFiberConnection());

  // Connection form state
  const [rpcUrl, setRpcUrl] = useState(fiberConfig.rpcUrl);
  const [authToken, setAuthToken] = useState(fiberConfig.authToken);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean, msg: string, nodeInfo?: any} | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const hasChanges = rpcUrl !== fiberConfig.rpcUrl || authToken !== fiberConfig.authToken;
  const isUrlValid = isValidUrl(rpcUrl);

  const handleTestConnection = async () => {
    if (!isUrlValid) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testFiberConnection({ rpcUrl, authToken });
      if (res.ok) {
        setTestResult({ ok: true, msg: "Connected successfully", nodeInfo: res.nodeInfo });
      } else {
        setTestResult({ ok: false, msg: res.error });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "Connection failed" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!isUrlValid) return;
    setIsSaving(true);
    try {
      await updateFiberConfig({ rpcUrl, authToken, mode: "real" });
      toast.success("Connection settings saved");
      setTestResult(null);
    } catch (e: any) {
      toast.error("Failed to connect: " + (e.message || "Unknown error"));
    } finally {
      setIsSaving(false);
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
        
        {/* Node Connection Panel */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground tracking-wide">
              <Server className="w-4 h-4 text-primary" />
              Your Fiber Node
            </div>
            {connState.mode === "real" && (
              <button 
                onClick={() => { toast("Reconnecting..."); reconnectFiber(); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                disabled={connState.status === "connecting"}
              >
                <RefreshCcw className={`w-3 h-3 ${connState.status === "connecting" ? "animate-spin" : ""}`} />
                Retry
              </button>
            )}
          </div>
          
          {/* Status Row */}
          <div className="px-2 mb-6">
            {connState.mode === "mock" ? (
              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/40">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                  <span className="font-medium text-foreground">Simulated Mode</span>
                </div>
                Using local mock data for testing. Real payments will not be sent.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/40">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${connState.status === 'connected' ? 'bg-primary shadow-[0_0_8px_rgba(22,201,83,0.8)]' : connState.status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`} />
                  <span className="font-medium text-foreground capitalize">{connState.status}</span>
                  {connState.nodeInfo && <span>· {connState.nodeInfo.network}</span>}
                </div>
                {connState.nodeInfo ? (
                  <div className="truncate opacity-80">
                    node {connState.nodeInfo.nodeId.slice(0, 6)}...{connState.nodeInfo.nodeId.slice(-4)}
                    {connState.nodeInfo.syncedBlock !== null && ` · synced block ${connState.nodeInfo.syncedBlock.toLocaleString()}`}
                    {` · ${connState.nodeInfo.channelCount} channels`}
                  </div>
                ) : connState.status === "error" ? (
                  <div className="text-destructive font-medium mt-1">{connState.lastError}</div>
                ) : (
                  <div className="opacity-80">Connecting to {connState.endpoint}...</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 px-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">RPC URL</label>
              <input
                type="text"
                value={rpcUrl}
                onChange={e => setRpcUrl(e.target.value)}
                placeholder="http://localhost:8227"
                className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              {!isUrlValid && rpcUrl.length > 0 && (
                <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Invalid URL
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auth Token <span className="opacity-60 normal-case">(Optional)</span></label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={authToken}
                  onChange={e => setAuthToken(e.target.value)}
                  placeholder="Bearer token"
                  className="w-full bg-background border border-border/50 rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button 
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`text-xs p-3 rounded-xl border flex items-start gap-2 ${testResult.ok ? 'bg-primary/10 border-primary/20 text-primary-foreground' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                {testResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <div>
                  <div className="font-medium">{testResult.msg}</div>
                  {testResult.nodeInfo && (
                    <div className="opacity-80 mt-1">
                      node {testResult.nodeInfo.nodeId.slice(0, 6)}...{testResult.nodeInfo.nodeId.slice(-4)} · {testResult.nodeInfo.network}
                      {testResult.nodeInfo.syncedBlock !== null && ` · block ${testResult.nodeInfo.syncedBlock.toLocaleString()}`}
                    </div>
                  )}
                  {!testResult.ok && (
                    <div className="opacity-90 mt-2 font-medium">Hint: Run <code className="bg-background/50 px-1 py-0.5 rounded">make dual-up</code> in the FiberPay node repo to start your local node.</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline"
                className="flex-1 h-12 rounded-xl text-sm"
                onClick={handleTestConnection}
                disabled={!isUrlValid || isTesting || isSaving}
              >
                {isTesting ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : "Test Connection"}
              </Button>
              <Button 
                variant="default"
                className="flex-1 h-12 rounded-xl text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveAndConnect}
                disabled={(!hasChanges && connState.mode === "real") || !isUrlValid || isTesting || isSaving}
              >
                {isSaving ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : "Save & Connect"}
              </Button>
            </div>

            <div className="pt-4 border-t border-border/40 mt-4">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Connection Mode</label>
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-1.5 rounded-xl border border-border/40">
                <button
                  onClick={() => {
                    if (connState.mode !== "real") {
                      switchToRealFiber();
                      toast.success("Switched to Real Fiber mode");
                    }
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${connState.mode === "real" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <div className={`w-2 h-2 rounded-full ${connState.mode === "real" ? "bg-primary" : "bg-transparent border border-muted-foreground"}`} />
                  Real Fiber
                </button>
                <button
                  onClick={() => {
                    if (connState.mode !== "mock") {
                      switchToMockFiber();
                      toast.success("Switched to Simulated mode");
                    }
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${connState.mode === "mock" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <div className={`w-2 h-2 rounded-full ${connState.mode === "mock" ? "bg-blue-500" : "bg-transparent border border-muted-foreground"}`} />
                  Simulated
                </button>
              </div>
            </div>

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
            Reset Mock Balances
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

        <div className="text-center text-xs text-muted-foreground pt-4 pb-4 flex flex-col gap-1">
          <p>FiberPay Wallet v1.0.0</p>
          <p>Client Side Only</p>
        </div>
      </div>
    </motion.div>
  );
}
