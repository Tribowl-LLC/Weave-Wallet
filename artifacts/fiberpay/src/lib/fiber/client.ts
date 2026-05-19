import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage } from "./types";
import { MockFiberClient } from "./mock-client";

export { FiberError } from "./mock-client";

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
}

let clientInstance: FiberClient | null = null;

export function getFiberClient(): FiberClient {
  if (!clientInstance) {
    // TODO: support real Fiber node via import.meta.env.VITE_FIBER_MODE === "real"
    clientInstance = new MockFiberClient();
  }
  return clientInstance;
}
