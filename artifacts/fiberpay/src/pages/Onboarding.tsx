import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server, Zap, Fingerprint, ArrowRight, ArrowLeft, CheckCircle2,
  FlaskConical, ShieldCheck, Copy, Check, RefreshCcw, XCircle,
  Wallet, Link2, ExternalLink, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWalletStore } from "@/store/wallet";
import {
  switchToMockFiber, getFiberClient,
  testFiberConnection, updateFiberConfig,
} from "@/lib/fiber/client";
import { getFiberConnection, subscribeFiberConnection } from "@/lib/fiber/connection";
import type { FiberReceiveAddress, FiberChannel, FiberNodeInfo } from "@/lib/fiber/types";
import { haptic } from "@/lib/haptics";
import QRDisplay from "@/components/QRDisplay";
import { ASSET_REGISTRY } from "@/lib/fiber/assets";

type Step = "welcome" | "node" | "fund" | "connect" | "channel";
const STEPS: Step[] = ["welcome", "node", "fund", "connect", "channel"];

const DOCKER_COMPOSE = `version: "3.8"
services:
  fnn:
    image: nervosnetwork/fiber:latest
    restart: unless-stopped
    ports:
      - "8228:8228"   # JSON-RPC
      - "8000:8000"   # p2p
    volumes:
      - ./fnn-data:/var/lib/fnn
    environment:
      FIBER_NETWORK: testnet
      FIBER_RPC_LISTEN: 0.0.0.0:8228`;

// Minimum balance (in USD-equivalent) the funding step considers "ready".
// Once total channel local-balance exceeds this we let the user advance.
const FUND_READY_USD = 1;

// ─────────────────────────────────────────────────────────────────────
// Top-level wizard component
// ─────────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { setHasOnboarded, unlocked, fiberConfig } = useWalletStore();
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    if (!unlocked) setLocation("/");
  }, [unlocked, setLocation]);

  if (!unlocked) return null;

  const idx = STEPS.indexOf(step);

  const goNext = () => {
    haptic.tap();
    const next = STEPS[Math.min(idx + 1, STEPS.length - 1)];
    setStep(next);
  };

  const goBack = () => {
    haptic.tap();
    setStep(STEPS[Math.max(idx - 1, 0)]);
  };

  const finishMock = () => {
    haptic.success();
    switchToMockFiber();
    setHasOnboarded(true);
    setLocation("/home");
  };

  const finishReal = () => {
    haptic.success();
    setHasOnboarded(true);
    setLocation("/home");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col bg-background relative overflow-hidden"
    >
      <div className="absolute top-1/3 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <header className="flex items-center justify-between px-6 pt-6 pb-3 z-10">
        <button
          onClick={goBack}
          disabled={idx === 0}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-xs text-muted-foreground font-medium tracking-wider uppercase">
          Step {idx + 1} of {STEPS.length}
        </div>
        <button
          onClick={finishMock}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
        >
          Skip with test mode
        </button>
      </header>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-1.5 mb-6 px-6 z-10">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${i <= idx ? "bg-primary" : "bg-muted"} ${i === idx ? "w-10" : "w-6"}`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col px-6 pb-6 max-w-md mx-auto w-full z-10">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <WelcomeStep key="welcome" onNext={goNext} />
          )}
          {step === "node" && (
            <NodeStep key="node" onNext={goNext} />
          )}
          {step === "fund" && (
            <FundStep
              key="fund"
              mode={fiberConfig.mode}
              onNext={goNext}
            />
          )}
          {step === "connect" && (
            <ConnectStep
              key="connect"
              onNext={goNext}
              onSwitchToMock={() => {
                switchToMockFiber();
                toast.success("Test mode enabled");
                goNext();
              }}
            />
          )}
          {step === "channel" && (
            <ChannelStep
              key="channel"
              mode={fiberConfig.mode}
              onFinish={fiberConfig.mode === "mock" ? finishMock : finishReal}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Welcome
// ─────────────────────────────────────────────────────────────────────
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <StepShell>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
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
      </div>
      <PrimaryNext onClick={onNext} label="Get started" />
    </StepShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Run your Fiber node (Docker compose copy)
// ─────────────────────────────────────────────────────────────────────
function NodeStep({ onNext }: { onNext: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    haptic.tap();
    try {
      await navigator.clipboard.writeText(DOCKER_COMPOSE);
      setCopied(true);
      toast.success("docker-compose.yml copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the snippet instead");
    }
  };

  return (
    <StepShell>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Run your Fiber node</h2>
            <p className="text-xs text-muted-foreground">Takes about 5 minutes with Docker.</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Save this as <code className="bg-muted px-1.5 py-0.5 rounded text-xs">docker-compose.yml</code> on a small VPS or Raspberry Pi and run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">docker compose up -d</code>.
        </p>

        <div className="relative bg-card border border-border/50 rounded-2xl overflow-hidden mb-4">
          <pre className="text-[11px] leading-relaxed font-mono p-4 overflow-x-auto text-foreground/90 max-h-64">
{DOCKER_COMPOSE}
          </pre>
          <button
            onClick={copy}
            aria-label="Copy docker-compose snippet"
            className="absolute top-2 right-2 p-2 bg-background/80 backdrop-blur rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="bg-card/50 border border-border/40 rounded-xl p-3 text-xs text-muted-foreground space-y-1.5 mb-4">
          <div className="flex items-start gap-2"><span className="text-primary font-mono">·</span>Your node will listen for JSON-RPC on port <code className="bg-muted px-1 rounded">8228</code>.</div>
          <div className="flex items-start gap-2"><span className="text-primary font-mono">·</span>Initial sync against testnet takes ~10–20 minutes.</div>
          <div className="flex items-start gap-2"><span className="text-primary font-mono">·</span>Image tag and ports above match the public <code className="bg-muted px-1 rounded">fnn</code> reference — adjust if you use a custom build.</div>
        </div>
      </div>
      <PrimaryNext onClick={onNext} label="Next: fund my node" />
    </StepShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Fund My Node (deposit address + QR + polling)
// ─────────────────────────────────────────────────────────────────────
function FundStep({ mode, onNext }: { mode: "mock" | "real"; onNext: () => void }) {
  const [addr, setAddr] = useState<FiberReceiveAddress | null>(null);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrLoading, setAddrLoading] = useState(true);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  const autoAdvancedRef = useRef(false);

  // Fetch deposit address once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAddrLoading(true);
      setAddrError(null);
      try {
        const client = getFiberClient();
        if (!client.getReceiveAddress) {
          throw new Error("This node build doesn't expose a deposit-address RPC. Look up your address with your node's own tooling.");
        }
        const r = await client.getReceiveAddress();
        if (cancelled) return;
        setAddr(r);
        if (r.isFallback) {
          setAddrError("Your node didn't return a deposit address. Use your node's CLI or web UI to find one.");
        }
      } catch (e: any) {
        if (cancelled) return;
        setAddrError(e?.message || "Couldn't fetch a deposit address");
      } finally {
        if (!cancelled) setAddrLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  // Poll balance every 5s. Auto-advance the first time we cross the
  // "ready" threshold so the user isn't blocked here once funds arrive.
  useEffect(() => {
    let cancelled = false;
    let timer: any = null;

    const tick = async () => {
      if (cancelled) return;
      setBalLoading(true);
      try {
        const client = getFiberClient();
        const balances = await client.getBalances();
        if (cancelled) return;
        // Crude USD estimate: sum RUSD + USDI as 1:1 USD, normalised by
        // each asset's decimals from the registry.
        let usd = 0;
        for (const b of balances) {
          const asset = ASSET_REGISTRY[b.asset];
          if (!asset) continue;
          usd += Number(b.amount) / 10 ** asset.decimals;
        }
        setTotalUsd(usd);
        setBalError(null);
        if (usd >= FUND_READY_USD && !autoAdvancedRef.current) {
          autoAdvancedRef.current = true;
          setAutoAdvanced(true);
          haptic.success();
          toast.success("Funds detected — moving on.");
          setTimeout(() => { if (!cancelled) onNext(); }, 1500);
        }
      } catch (e: any) {
        // Surface the failure so the user understands why "Waiting for
        // deposit…" never resolves (architect finding). The next tick
        // will clear it if the call succeeds.
        if (!cancelled) setBalError(e?.message || "Couldn't reach your node");
      } finally {
        if (!cancelled) setBalLoading(false);
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [onNext]);

  const copyAddr = async () => {
    if (!addr?.address) return;
    haptic.tap();
    try {
      await navigator.clipboard.writeText(addr.address);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy address");
    }
  };

  const simulateDeposit = () => {
    // Test-mode helper: bump the mock client's persisted balances so the
    // poller picks it up on the next tick.
    haptic.tap();
    try {
      const r = localStorage.getItem("fiberpay.balances.RUSD");
      const next = (r ? BigInt(r) : 0n) + 100_000000n; // +$100 RUSD
      localStorage.setItem("fiberpay.balances.RUSD", next.toString());
      toast.success("Simulated $100 RUSD deposit");
    } catch {
      toast.error("Couldn't simulate deposit in this browser");
    }
  };

  const isReady = (totalUsd ?? 0) >= FUND_READY_USD;

  return (
    <StepShell>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Fund your node</h2>
            <p className="text-xs text-muted-foreground">
              {mode === "mock" ? "Simulated deposit address for testing." : "Send RUSD or USDI to your node's CKB address."}
            </p>
          </div>
        </div>

        {/* QR + address card */}
        <div className="bg-card border border-border/50 rounded-2xl p-4 mb-4 flex flex-col items-center">
          {addrLoading ? (
            <div className="w-[220px] h-[220px] bg-muted/20 border border-border/40 rounded-2xl animate-pulse" />
          ) : addr?.address ? (
            <QRDisplay value={addr.address} size={220} ariaLabel="Deposit address QR code" />
          ) : (
            <div className="w-[220px] h-[220px] bg-muted/20 border border-border/40 rounded-2xl flex items-center justify-center px-4 text-center">
              <span className="text-xs text-muted-foreground">No address available</span>
            </div>
          )}

          {addr?.address && (
            <div className="mt-4 w-full">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
                {addr.network !== "unknown" ? `${addr.network} address` : "Deposit address"}
              </div>
              <button
                onClick={copyAddr}
                className="w-full flex items-center justify-between gap-2 bg-muted/30 hover:bg-muted/50 border border-border/40 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Copy deposit address"
              >
                <span className="font-mono text-[11px] truncate text-foreground/90">{addr.address}</span>
                {copied ? <Check className="w-4 h-4 text-primary shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
            </div>
          )}

          {addrError && (
            <div className="mt-3 w-full text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{addrError}</span>
            </div>
          )}
        </div>

        {/* Balance + status */}
        <div className="bg-card/50 border border-border/40 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Node balance</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {balLoading && <RefreshCcw className="w-3 h-3 animate-spin" />}
              auto-refresh
            </span>
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {totalUsd === null ? "—" : `$${totalUsd.toFixed(2)}`}
          </div>
          <div className={`mt-2 text-xs flex items-center gap-1.5 ${isReady ? "text-primary" : balError ? "text-destructive" : "text-muted-foreground"}`}>
            {isReady ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : balError ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
            {isReady
              ? (autoAdvanced ? "Funds received — continuing…" : "Funds detected — ready to open channels")
              : balError
                ? balError
                : "Waiting for deposit…"}
          </div>
        </div>

        {/* Recommended amounts + faucets */}
        <div className="space-y-2 mb-4">
          <div className="text-xs text-muted-foreground px-1">
            Recommended: <span className="text-foreground font-medium">$50–$200 in RUSD or USDI</span> to start. You can top up anytime.
          </div>
          {mode === "real" && (
            <div className="grid grid-cols-2 gap-2">
              <FaucetLink label="RUSD faucet" url="https://faucet.nervos.org/" />
              <FaucetLink label="USDI faucet" url="https://faucet.nervos.org/" />
            </div>
          )}
          {mode === "mock" && (
            <button
              onClick={simulateDeposit}
              className="w-full text-xs bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/15 rounded-xl py-2 text-amber-400 font-medium transition-colors"
            >
              Simulate $100 RUSD deposit
            </button>
          )}
        </div>
      </div>

      <Button
        onClick={() => { haptic.tap(); onNext(); }}
        className="w-full h-14 rounded-2xl text-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgba(22,201,83,0.25)]"
      >
        {isReady ? "I've funded — continue" : "Skip for now"}
        <ArrowRight className="w-4 h-4 ml-1" />
      </Button>
    </StepShell>
  );
}

function FaucetLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-xs bg-card/50 border border-border/40 hover:border-border rounded-xl py-2 px-3 flex items-center justify-between gap-1 transition-colors"
    >
      <span className="font-medium">{label}</span>
      <ExternalLink className="w-3 h-3 text-muted-foreground" />
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Connect & test (inline RPC form, reuses testFiberConnection)
// ─────────────────────────────────────────────────────────────────────
function ConnectStep({ onNext, onSwitchToMock }: { onNext: () => void; onSwitchToMock: () => void }) {
  const { fiberConfig } = useWalletStore();
  const [rpcUrl, setRpcUrl] = useState(fiberConfig.rpcUrl);
  const [authToken, setAuthToken] = useState(fiberConfig.authToken);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; nodeInfo?: FiberNodeInfo } | null>(null);

  const isUrlValid = useMemo(() => {
    try { const u = new URL(rpcUrl); return !!u.protocol && !!u.host; } catch { return false; }
  }, [rpcUrl]);

  const test = async () => {
    if (!isUrlValid) return;
    haptic.tap();
    setIsTesting(true); setResult(null);
    try {
      const r = await testFiberConnection({ rpcUrl, authToken });
      if (r.ok) { setResult({ ok: true, msg: "Connected successfully", nodeInfo: r.nodeInfo }); haptic.success(); }
      else { setResult({ ok: false, msg: r.error }); haptic.warning(); }
    } catch (e: any) { setResult({ ok: false, msg: e?.message || "Connection failed" }); haptic.warning(); }
    finally { setIsTesting(false); }
  };

  const saveAndContinue = async () => {
    if (!isUrlValid) return;
    haptic.tap();
    setIsSaving(true);
    try {
      // updateFiberConfig persists the config and runs bootstrap, but it
      // RESOLVES (doesn't throw) even when the node is unreachable — it
      // just records the error on the connection state. So we must
      // inspect the resulting status ourselves before claiming success.
      const state = await updateFiberConfig({ rpcUrl, authToken, mode: "real" });
      if (state.status === "connected") {
        toast.success("Connected");
        haptic.success();
        setResult({ ok: true, msg: "Connected successfully", nodeInfo: state.nodeInfo ?? undefined });
        onNext();
      } else {
        const msg = state.lastError || "Couldn't reach your node — check the URL and that fnn is running.";
        toast.error(msg);
        setResult({ ok: false, msg });
        haptic.warning();
      }
    } catch (e: any) {
      toast.error("Couldn't connect: " + (e?.message || "Unknown error"));
      setResult({ ok: false, msg: e?.message || "Unknown error" });
      haptic.warning();
    } finally { setIsSaving(false); }
  };

  return (
    <StepShell>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Connect to your node</h2>
            <p className="text-xs text-muted-foreground">Paste the JSON-RPC URL your node exposes.</p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">RPC URL</label>
            <input
              type="text"
              value={rpcUrl}
              onChange={e => setRpcUrl(e.target.value)}
              placeholder="http://localhost:8228"
              className="w-full bg-card border border-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
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
                className="w-full bg-card border border-border/50 rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? "Hide token" : "Show token"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className={`text-xs p-3 rounded-xl border flex items-start gap-2 mb-4 ${result.ok ? "bg-primary/10 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
            {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div>
              <div className="font-medium">{result.msg}</div>
              {result.nodeInfo && (
                <div className="opacity-80 mt-1 text-foreground/80">
                  node {result.nodeInfo.nodeId.slice(0, 6)}…{result.nodeInfo.nodeId.slice(-4)} · {result.nodeInfo.network}
                </div>
              )}
              {!result.ok && (
                <div className="opacity-90 mt-1.5 text-foreground/80">
                  Common fixes: confirm <code className="bg-background/40 px-1 rounded">docker compose ps</code> shows fnn running and the URL is reachable from this device.
                </div>
              )}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="h-12 rounded-xl text-sm mb-3"
          onClick={test}
          disabled={!isUrlValid || isTesting || isSaving}
        >
          {isTesting ? <><RefreshCcw className="w-4 h-4 mr-2 animate-spin" />Testing…</> : "Test connection"}
        </Button>

        <button
          onClick={onSwitchToMock}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-center"
        >
          No node yet? Continue in test mode
        </button>
      </div>

      <Button
        onClick={saveAndContinue}
        disabled={!isUrlValid || isSaving || isTesting}
        className="w-full h-14 rounded-2xl text-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgba(22,201,83,0.25)]"
      >
        {isSaving ? <><RefreshCcw className="w-4 h-4 mr-2 animate-spin" />Connecting…</> : <>Save & continue <ArrowRight className="w-4 h-4 ml-1" /></>}
      </Button>
    </StepShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 5 — Open first channel
// ─────────────────────────────────────────────────────────────────────
function ChannelStep({ mode, onFinish }: { mode: "mock" | "real"; onFinish: () => void }) {
  const [channels, setChannels] = useState<FiberChannel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [connState, setConnState] = useState(getFiberConnection());

  useEffect(() => subscribeFiberConnection(setConnState), []);

  const refresh = async () => {
    setLoading(true);
    try {
      const c = getFiberClient();
      if (c.listChannels) {
        const list = await c.listChannels();
        setChannels(list);
      } else {
        setChannels([]);
      }
    } catch {
      setChannels(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChannels = (channels ?? []).filter(c => c.state === "open");
  const hasChannel = openChannels.length > 0;

  const simulateChannel = () => {
    haptic.tap();
    localStorage.setItem("fiberpay.mock.channel_opened", "1");
    toast.success("Simulated channel opened");
    refresh();
  };

  return (
    <StepShell>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center border border-primary/20">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Open your first channel</h2>
            <p className="text-xs text-muted-foreground">Channels are how your node sends Fiber payments.</p>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-2xl p-4 mb-4 space-y-2 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Recommended first channel</div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Peer</span>
            <span className="font-mono text-xs">a well-connected RUSD hub</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Asset</span>
            <span className="font-medium">RUSD</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">$50–$200</span>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
            FiberPay doesn't open channels for you — it's safer to do it from your node's CLI so you can review the peer and fee parameters. The wallet will detect the channel once it's live.
          </p>
        </div>

        <a
          href="https://github.com/nervosnetwork/fiber"
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between gap-2 bg-card/50 border border-border/40 hover:border-border rounded-xl px-4 py-3 text-sm transition-colors mb-4"
        >
          <span className="font-medium">Open Fiber channel docs</span>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </a>

        {/* Channel status */}
        <div className="bg-card/50 border border-border/40 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Channel status</span>
            <button
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh channel list"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RefreshCcw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>
          {channels === null ? (
            <div className="text-sm text-muted-foreground">Couldn't reach your node. We'll keep trying.</div>
          ) : hasChannel ? (
            <div className="text-sm text-primary flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {openChannels.length} open channel{openChannels.length > 1 ? "s" : ""} detected
            </div>
          ) : (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Waiting for an open channel…
            </div>
          )}
        </div>

        {mode === "mock" && !hasChannel && (
          <button
            onClick={simulateChannel}
            className="w-full text-xs bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/15 rounded-xl py-2 text-amber-400 font-medium transition-colors mb-4"
          >
            Simulate channel open
          </button>
        )}

        {mode === "real" && connState.status === "error" && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2 mb-4">
            Your node is unreachable right now. You can still finish setup — the wallet will reconnect automatically.
          </div>
        )}
      </div>

      <Button
        onClick={onFinish}
        className="w-full h-14 rounded-2xl text-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgba(22,201,83,0.25)]"
      >
        {hasChannel ? "Finish setup" : "Finish — I'll open a channel later"}
        <ArrowRight className="w-4 h-4 ml-1" />
      </Button>
    </StepShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared shells
// ─────────────────────────────────────────────────────────────────────
function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col w-full"
    >
      {children}
    </motion.div>
  );
}

function PrimaryNext({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      onClick={onClick}
      className="w-full h-14 rounded-2xl text-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgba(22,201,83,0.25)]"
    >
      {label} <ArrowRight className="w-4 h-4 ml-1" />
    </Button>
  );
}
