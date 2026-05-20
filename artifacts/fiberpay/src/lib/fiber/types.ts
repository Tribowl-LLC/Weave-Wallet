export type AssetSymbol = "RUSD" | "USDI";

export interface Asset {
  symbol: AssetSymbol;
  name: string;
  decimals: number;
  typeHash: string;
  network: "fiber";
  iconColor: string;
}

export interface FiberBalance {
  asset: AssetSymbol;
  amount: bigint;
}

export interface FiberInvoice {
  invoiceId: string;
  asset: AssetSymbol;
  amount: bigint;
  amountUsd: number;
  expiresAt: number;
  paymentHash: string;
  description?: string;
  lightningInvoice: string;
}

export type PaymentStage =
  | "idle"
  | "authenticating"
  | "creating_invoice"
  | "routing"
  | "settling"
  | "awaiting_lightning"
  | "settled"
  | "failed";

// Status of the original Lightning invoice on the OTHER side of the bridge.
// - settled: the Lightning invoice was provably fulfilled (preimage confirmed)
// - pending: Fiber side ok, Lightning side not yet confirmed within our wait window
// - failed:  node reported the Lightning leg failed (refund expected)
// - unknown: node didn't expose enough info to determine (best-effort guess)
export type LightningStatus = "settled" | "pending" | "failed" | "unknown";

export interface PaymentResult {
  paymentId: string;
  fiberTxHash: string;
  preimage: string;
  settledAt: number;
  lightningStatus: LightningStatus;
  lightningError?: string;
}

export type FiberConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
export type FiberMode = "mock" | "real";

export interface FiberNodeInfo {
  nodeId: string;          // public Fiber node id (hex)
  version: string;
  network: string;         // "mainnet" | "testnet" | "devnet"
  channelCount: number;
  syncedBlock: number | null;
}

export interface FiberConnectionState {
  mode: FiberMode;
  status: FiberConnectionStatus;
  endpoint: string | null;
  nodeInfo: FiberNodeInfo | null;
  lastError: string | null;
}

export class FiberRpcError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) {
    super(message);
    this.name = "FiberRpcError";
  }
}
