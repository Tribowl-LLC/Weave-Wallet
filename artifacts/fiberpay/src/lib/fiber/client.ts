import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberNodeInfo } from "./types";
import { MockFiberClient } from "./mock-client";
import { RealFiberClient } from "./real-client";
import { getFiberConnection, setFiberConnection } from "./connection";
import { FiberRpcError } from "./types";

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
  onStage?(handler: (stage: PaymentStage, detail?: string) => void): () => void;
  getNodeInfo?(): Promise<FiberNodeInfo>;
  healthCheck?(): Promise<boolean>;
}

let cached: FiberClient | null = null;

export function getFiberClient(): FiberClient {
  if (cached) return cached;
  const url = import.meta.env.VITE_FIBER_RPC_URL as string | undefined;
  const mode = (import.meta.env.VITE_FIBER_MODE as string | undefined) ?? "auto";

  if (mode === "real" || (mode === "auto" && url)) {
    if (!url) {
      console.warn("[fiber] mode=real but VITE_FIBER_RPC_URL not set; falling back to mock");
    } else {
      cached = new RealFiberClient(url);
      setFiberConnection({ mode: "real", endpoint: url, status: "disconnected" });
      return cached;
    }
  }
  cached = new MockFiberClient();
  setFiberConnection({ mode: "mock", endpoint: null, status: "connected" });
  return cached;
}

export async function bootstrapFiberConnection(): Promise<void> {
  const client = getFiberClient();
  const state = getFiberConnection();
  if (state.mode === "mock") return;
  setFiberConnection({ status: "connecting", nodeInfo: null, lastError: null });
  try {
    const ok = await client.healthCheck?.();
    if (!ok) throw new FiberRpcError("unreachable", "Fiber node did not respond");
    const info = await client.getNodeInfo?.();
    setFiberConnection({ status: "connected", nodeInfo: info ?? null, lastError: null });
  } catch (err: any) {
    const msg = err?.message ?? "Connection failed";
    console.warn("[fiber] real node unreachable:", msg);
    // Stay in real mode with status=error so the UI can surface a retry banner
    // and the user can explicitly choose to fall back via switchToMockFiber().
    setFiberConnection({ status: "error", nodeInfo: null, lastError: msg });
  }
}

export async function reconnectFiber(): Promise<void> {
  const state = getFiberConnection();
  if (state.mode === "real" && state.endpoint) {
    // Recreate the real client (clears any internal state) and re-bootstrap.
    cached = new RealFiberClient(state.endpoint);
  } else {
    cached = null;
  }
  await bootstrapFiberConnection();
}

// Explicit user-initiated fallback from a broken real connection to the mock.
export function switchToMockFiber(): void {
  cached = new MockFiberClient();
  setFiberConnection({ mode: "mock", endpoint: null, status: "connected", nodeInfo: null, lastError: null });
}

