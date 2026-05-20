import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberNodeInfo, FiberConnectionState, LightningStatus } from "./types";
import { MockFiberClient } from "./mock-client";
import { RealFiberClient } from "./real-client";
import { getFiberConnection, setFiberConnection } from "./connection";
import { FiberRpcError } from "./types";
import { useWalletStore } from "@/store/wallet";
import type { FiberConfig as WalletFiberConfig } from "@/store/wallet";

export { FiberError } from "./mock-client";
export { FiberRpcError };

export interface FiberClient {
  getBalances(): Promise<FiberBalance[]>;
  createInvoiceFromLightning(args: {
    lightningInvoice: string;
    amountMsat: number;
    description?: string;
    asset: AssetSymbol;
  }): Promise<FiberInvoice>;
  sendPayment(args: {
    invoice: FiberInvoice;
    signedAuthorization: string;
  }): Promise<PaymentResult>;
  // Re-poll the original Lightning invoice's settlement status when an
  // earlier call left it in "pending". Optional because not every client
  // implementation can introspect Lightning state.
  retryLightningFulfillment?(args: {
    paymentResult: PaymentResult;
    lightningInvoice: string;
    lightningPaymentHash?: string;
  }): Promise<{ status: LightningStatus; error?: string }>;
  onStage?(handler: (stage: PaymentStage, detail?: string) => void): () => void;
  getNodeInfo?(): Promise<FiberNodeInfo>;
  healthCheck?(): Promise<boolean>;
}

let cached: FiberClient | null = null;
let cachedSignature: string | null = null;

function getCurrentConfig(): WalletFiberConfig {
  return useWalletStore.getState().fiberConfig;
}

function getSignature(cfg: WalletFiberConfig): string {
  return `${cfg.mode}:${cfg.rpcUrl}:${cfg.authToken}`;
}

export function getFiberClient(): FiberClient {
  const cfg = getCurrentConfig();
  const sig = getSignature(cfg);
  if (cached && cachedSignature === sig) {
    return cached;
  }
  
  if (cfg.mode === "real") {
    cached = new RealFiberClient({ url: cfg.rpcUrl, authToken: cfg.authToken });
    cachedSignature = sig;
    return cached;
  }
  
  cached = new MockFiberClient();
  cachedSignature = sig;
  return cached;
}

export async function bootstrapFiberConnection(): Promise<void> {
  const cfg = getCurrentConfig();
  if (cfg.mode === "mock") {
    setFiberConnection({ mode: "mock", endpoint: null, status: "connected", nodeInfo: null, lastError: null });
    return;
  }

  const client = getFiberClient();
  setFiberConnection({ mode: "real", endpoint: cfg.rpcUrl, status: "connecting", nodeInfo: null, lastError: null });
  
  const delays = [0, 1000, 3000];
  let lastErrorMsg = "Unknown error";
  
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      await new Promise(r => setTimeout(r, delays[i]));
    }
    
    // Check if mode changed during backoff
    const currentCfg = getCurrentConfig();
    if (currentCfg.mode !== "real" || currentCfg.rpcUrl !== cfg.rpcUrl || currentCfg.authToken !== cfg.authToken) {
      return; // abort, config changed
    }

    try {
      const ok = await client.healthCheck?.();
      if (!ok) throw new Error("Health check failed (timeout or node error)");
      
      const info = await client.getNodeInfo?.();
      setFiberConnection({ mode: "real", endpoint: cfg.rpcUrl, status: "connected", nodeInfo: info ?? null, lastError: null });
      return;
    } catch (err: any) {
      lastErrorMsg = err?.message ?? "Connection failed";
      console.warn(`[fiber] real node unreachable (attempt ${i + 1}/${delays.length}):`, lastErrorMsg);
    }
  }

  // Final failure
  setFiberConnection({ 
    mode: "real", 
    endpoint: cfg.rpcUrl, 
    status: "error", 
    nodeInfo: null, 
    lastError: `Cannot reach your Fiber node at ${cfg.rpcUrl} — is it running?` 
  });
}

export async function updateFiberConfig(patch: Partial<WalletFiberConfig>): Promise<FiberConnectionState> {
  useWalletStore.getState().setFiberConfig(patch);
  await bootstrapFiberConnection();
  return getFiberConnection();
}

export async function testFiberConnection(cfg: { rpcUrl: string; authToken: string }): Promise<{ ok: true; nodeInfo: FiberNodeInfo } | { ok: false; error: string }> {
  const testClient = new RealFiberClient({ url: cfg.rpcUrl, authToken: cfg.authToken });
  try {
    const ok = await testClient.healthCheck();
    if (!ok) return { ok: false, error: `Cannot reach node at ${cfg.rpcUrl} (health check failed)` };
    
    const info = await testClient.getNodeInfo();
    return { ok: true, nodeInfo: info };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unknown error during test" };
  }
}

export async function reconnectFiber(): Promise<void> {
  // Clear cache to force recreation of client if needed, but config didn't change
  cached = null;
  cachedSignature = null;
  await bootstrapFiberConnection();
}

export function switchToMockFiber(): void {
  useWalletStore.getState().setFiberConfig({ mode: "mock" });
  cached = null;
  cachedSignature = null;
  bootstrapFiberConnection();
}

export function switchToRealFiber(): void {
  useWalletStore.getState().setFiberConfig({ mode: "real" });
  cached = null;
  cachedSignature = null;
  bootstrapFiberConnection();
}
