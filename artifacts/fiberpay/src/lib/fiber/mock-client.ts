import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage } from "./types";
import type { FiberClient } from "./client";
import { MSAT_TO_USD_RATE } from "../lightning";
import { getAsset } from "./assets";

export class FiberError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "FiberError";
  }
}

function randomHex(bytes: number = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export class MockFiberClient implements FiberClient {
  private handlers = new Set<(stage: PaymentStage, detail?: string) => void>();

  private loadBalances(): { RUSD: bigint; USDI: bigint } {
    try {
      const r = localStorage.getItem("fiberpay.balances.RUSD");
      const u = localStorage.getItem("fiberpay.balances.USDI");
      return {
        RUSD: r ? BigInt(r) : 1284_500000n,
        USDI: u ? BigInt(u) : 12840_000000n,
      };
    } catch {
      return { RUSD: 1284_500000n, USDI: 12840_000000n };
    }
  }

  private saveBalances(balances: { RUSD: bigint; USDI: bigint }) {
    localStorage.setItem("fiberpay.balances.RUSD", balances.RUSD.toString());
    localStorage.setItem("fiberpay.balances.USDI", balances.USDI.toString());
  }

  async getBalances(): Promise<FiberBalance[]> {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    const b = this.loadBalances();
    return [
      { asset: "RUSD", amount: b.RUSD },
      { asset: "USDI", amount: b.USDI },
    ];
  }

  async createInvoiceFromLightning(args: {
    lightningInvoice: string;
    amountMsat: number;
    description?: string;
    asset: AssetSymbol;
  }): Promise<FiberInvoice> {
    await new Promise(r => setTimeout(r, 250));
    
    const amountUsd = args.amountMsat * MSAT_TO_USD_RATE;
    const assetInfo = getAsset(args.asset);
    
    // Convert USD to asset amount considering decimals
    const multiplier = 10 ** assetInfo.decimals;
    const amount = BigInt(Math.floor(amountUsd * multiplier));

    return {
      invoiceId: "fbi_" + crypto.randomUUID(),
      asset: args.asset,
      amount,
      amountUsd,
      expiresAt: Date.now() + 5 * 60 * 1000,
      paymentHash: randomHex(32),
      description: args.description,
      lightningInvoice: args.lightningInvoice,
    };
  }

  async sendPayment(args: {
    invoice: FiberInvoice;
    signedAuthorization: string;
  }): Promise<PaymentResult> {
    const notify = (s: PaymentStage, d?: string) => this.handlers.forEach(h => h(s, d));
    
    const balances = this.loadBalances();
    if (balances[args.invoice.asset] < args.invoice.amount) {
      throw new FiberError("insufficient_balance", "Not enough balance to cover this payment");
    }

    balances[args.invoice.asset] -= args.invoice.amount;
    this.saveBalances(balances);

    notify("routing", "Finding route on Fiber network...");
    await new Promise(r => setTimeout(r, 900));

    if (Math.random() < 0.05) {
      // Refund
      const rb = this.loadBalances();
      rb[args.invoice.asset] += args.invoice.amount;
      this.saveBalances(rb);
      throw new FiberError("routing_failed", "No route found on Fiber network");
    }

    notify("settling", "Settling via Lightning...");
    await new Promise(r => setTimeout(r, 700));

    if (Math.random() < 0.03) {
      // Refund
      const rb = this.loadBalances();
      rb[args.invoice.asset] += args.invoice.amount;
      this.saveBalances(rb);
      throw new FiberError("lightning_failed", "Lightning settlement failed; funds refunded");
    }

    notify("settled", "Payment complete");
    return {
      paymentId: "pay_" + crypto.randomUUID(),
      fiberTxHash: randomHex(32),
      preimage: randomHex(32),
      settledAt: Date.now(),
    };
  }

  onStage(handler: (stage: PaymentStage, detail?: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
