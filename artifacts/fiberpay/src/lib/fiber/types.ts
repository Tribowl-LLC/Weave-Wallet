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
