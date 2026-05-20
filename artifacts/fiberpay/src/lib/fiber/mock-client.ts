import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberReceiveAddress, FiberChannel } from "./types";
import type { FiberClient } from "./client";
import { msatToAssetUnits, msatToUsd } from "./conversion";
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
    
    const amountUsd = msatToUsd(args.amountMsat);
    const assetInfo = getAsset(args.asset);
    const amount = msatToAssetUnits(args.amountMsat, assetInfo);

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

    notify("creating_invoice", "Creating Fiber invoice...");
    await new Promise(r => setTimeout(r, 350));

    notify("routing", "Sending payment on Fiber...");
    await new Promise(r => setTimeout(r, 900));

    if (Math.random() < 0.05) {
      // Refund
      const rb = this.loadBalances();
      rb[args.invoice.asset] += args.invoice.amount;
      this.saveBalances(rb);
      throw new FiberError("routing_failed", "No route found on Fiber network");
    }

    notify("settling", "Fulfilling Lightning invoice...");
    await new Promise(r => setTimeout(r, 700));

    if (Math.random() < 0.03) {
      // Refund
      const rb = this.loadBalances();
      rb[args.invoice.asset] += args.invoice.amount;
      this.saveBalances(rb);
      throw new FiberError("lightning_failed", "Lightning settlement failed; funds refunded");
    }

    notify("awaiting_lightning", "Confirming Lightning settlement...");
    await new Promise(r => setTimeout(r, 600));

    // Simulate realistic Lightning fulfillment outcomes. Fiber side has
    // already settled at this point; only the Lightning leg is in question.
    //  - 85% settled       (happy path: HTLC equivalence revealed preimage)
    //  - 10% pending       (bridge still confirming; retry will resolve)
    //   - 5% failed        (route dropped on LN side; refund expected)
    const r = Math.random();
    let lightningStatus: "settled" | "pending" | "failed";
    let lightningError: string | undefined;
    if (r < 0.85) {
      lightningStatus = "settled";
    } else if (r < 0.95) {
      lightningStatus = "pending";
    } else {
      lightningStatus = "failed";
      lightningError = "No route on Lightning side; node will refund the Fiber leg";
    }

    notify("settled", "Payment complete");
    return {
      paymentId: "pay_" + crypto.randomUUID(),
      fiberTxHash: randomHex(32),
      preimage: randomHex(32),
      settledAt: Date.now(),
      lightningStatus,
      lightningError,
    };
  }

  async retryLightningFulfillment(_args: {
    paymentResult: PaymentResult;
    lightningInvoice: string;
    lightningPaymentHash?: string;
  }): Promise<{ status: "settled" | "pending" | "failed" | "unknown"; error?: string }> {
    // Mock retry: 70% chance the pending payment settled by now, otherwise
    // still pending. Failed payments stay failed (refund already issued).
    await new Promise(r => setTimeout(r, 800));
    if (_args.paymentResult.lightningStatus === "failed") {
      return { status: "failed", error: _args.paymentResult.lightningError };
    }
    return Math.random() < 0.7 ? { status: "settled" } : { status: "pending" };
  }

  onStage(handler: (stage: PaymentStage, detail?: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Returns a stable fake testnet CKB address so the Fund-My-Node UI has
  // something real to QR-encode in test mode. We also expose a small
  // helper localStorage knob the UI can poke to simulate deposits.
  async getReceiveAddress(): Promise<FiberReceiveAddress> {
    await new Promise(r => setTimeout(r, 120));
    const KEY = "fiberpay.mock.deposit_address";
    let addr = localStorage.getItem(KEY);
    if (!addr) {
      const tail = Array.from(crypto.getRandomValues(new Uint8Array(20)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      addr = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq" + tail;
      localStorage.setItem(KEY, addr);
    }
    return { address: addr, network: "testnet", isFallback: false };
  }

  // Simulated channels for the channel-open guidance step. By default an
  // empty array (mirrors a freshly-funded node with no channels yet); the
  // user can flip a localStorage flag from the UI to pretend they've
  // opened a channel.
  async listChannels(): Promise<FiberChannel[]> {
    await new Promise(r => setTimeout(r, 150));
    const opened = localStorage.getItem("fiberpay.mock.channel_opened") === "1";
    if (!opened) return [];
    return [
      {
        channelId: "0xmock_channel_" + "0".repeat(48),
        peerNodeId: "0xmock_peer_" + "0".repeat(50),
        asset: "RUSD",
        localBalance: 200_000000n,
        remoteBalance: 50_000000n,
        state: "open",
      },
    ];
  }
}

