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
  | "settled"
  | "failed";

export interface PaymentResult {
  paymentId: string;
  fiberTxHash: string;
  preimage: string;
  settledAt: number;
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
