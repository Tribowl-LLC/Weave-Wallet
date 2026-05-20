import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberNodeInfo } from "./types";
import { FiberRpcError } from "./types";
import type { FiberClient } from "./client";
import { jsonRpcCall } from "./json-rpc";
import { getAsset, ASSET_REGISTRY } from "./assets";
import { msatToAssetUnits, msatToUsd } from "./conversion";

export class RealFiberClient implements FiberClient {
  private handlers = new Set<(stage: PaymentStage, detail?: string) => void>();
  private url: string;
  private authToken?: string;

  constructor(config: { url: string; authToken?: string }) {
    this.url = config.url;
    this.authToken = config.authToken;
  }

  onStage(handler: (stage: PaymentStage, detail?: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(stage: PaymentStage, detail?: string) {
    this.handlers.forEach(h => h(stage, detail));
  }

  async getNodeInfo(): Promise<FiberNodeInfo> {
    const opts = { url: this.url, authToken: this.authToken };
    const result = await jsonRpcCall<any>(opts, "node_info");
    
    let syncedBlock = null;
    if (result) {
      if (result.synced_block !== undefined) syncedBlock = result.synced_block;
      else if (result.tip_block_number !== undefined) syncedBlock = result.tip_block_number;
      else if (result.height !== undefined) syncedBlock = result.height;
      else {
        try {
          const tipResult = await jsonRpcCall<any>(opts, "get_tip_block_number");
          syncedBlock = tipResult;
        } catch (e) {
          syncedBlock = null;
        }
      }
    }
    
    if (typeof syncedBlock === 'string' && syncedBlock.startsWith('0x')) {
      syncedBlock = parseInt(syncedBlock, 16);
    } else if (typeof syncedBlock === 'string') {
      syncedBlock = parseInt(syncedBlock, 10);
    }

    return {
      nodeId: result?.node_id || "unknown",
      version: result?.version || "unknown",
      network: result?.network || "unknown",
      channelCount: result?.channel_count || 0,
      syncedBlock: isNaN(syncedBlock as number) ? null : (syncedBlock as number),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await jsonRpcCall({ url: this.url, authToken: this.authToken, timeoutMs: 5000 }, "node_info");
      return true;
    } catch (err) {
      return false;
    }
  }

  async getBalances(): Promise<FiberBalance[]> {
    const channels = await jsonRpcCall<any[]>({ url: this.url, authToken: this.authToken }, "list_channels");
    
    let rusdBalance = 0n;
    let usdiBalance = 0n;

    for (const channel of channels || []) {
      const udt = channel.udt_type_script;
      const bal = channel.local_balance ? BigInt(channel.local_balance) : 0n;
      if (!udt) continue;
      
      if (udt === ASSET_REGISTRY.RUSD.typeHash) {
        rusdBalance += bal;
      } else if (udt === ASSET_REGISTRY.USDI.typeHash) {
        usdiBalance += bal;
      }
    }

    return [
      { asset: "RUSD", amount: rusdBalance },
      { asset: "USDI", amount: usdiBalance },
    ];
  }

  async createInvoiceFromLightning(args: {
    lightningInvoice: string;
    amountMsat: number;
    description?: string;
    asset: AssetSymbol;
  }): Promise<FiberInvoice> {
    // Pure local quote — no RPC call.
    // The wallet is PAYING a Lightning invoice, not creating an incoming one,
    // so the real `new_invoice` RPC is intentionally NOT called here. That RPC
    // would generate an inbound invoice on the user's own node, which is the
    // opposite of what we want. The actual cross-network payment is fired in
    // sendPayment() via `send_payment` with the lightning_invoice parameter.
    const assetInfo = getAsset(args.asset);
    const amount = msatToAssetUnits(args.amountMsat, assetInfo);
    const amountUsd = msatToUsd(args.amountMsat);

    return {
      invoiceId: "fbi_quote_" + crypto.randomUUID(),
      asset: args.asset,
      amount,
      amountUsd,
      expiresAt: Date.now() + 300 * 1000,
      paymentHash: "",  // unknown locally; populated from send_payment response
      description: args.description,
      lightningInvoice: args.lightningInvoice,
    };
  }

  async sendPayment(args: {
    invoice: FiberInvoice;
    signedAuthorization: string;
  }): Promise<PaymentResult> {
    // ─────────────────────────────────────────────────────────────────────
    // TODO (Phase 6): atomic Lightning fulfillment
    //
    // Today we hand the user's Fiber node the original Lightning invoice via
    // the `lightning_invoice` field of `send_payment` and trust the node to
    // bridge atomically. In practice "bridging" requires one of:
    //   1. A Fiber<->Lightning cross-network channel where the same payment
    //      hash settles both legs (HTLC equivalence), so a successful Fiber
    //      payment reveals the preimage that fulfills the Lightning invoice.
    //   2. A submarine swap / atomic-swap module on the node side that locks
    //      the Fiber-side asset until the Lightning payment confirms.
    // Either way the atomicity guarantee lives on the NODE, not in the PWA.
    // If the user's Fiber build doesn't implement one of these, the Lightning
    // invoice will NOT be fulfilled even after Fiber-side settlement, and we
    // should surface a clearer error than the current generic failure.
    // ─────────────────────────────────────────────────────────────────────
    try {
      this.notify("creating_invoice", "Creating Fiber invoice...");

      const sendRes = await jsonRpcCall<any>({ url: this.url, authToken: this.authToken }, "send_payment", {
        invoice: args.invoice.invoiceId,
        lightning_invoice: args.invoice.lightningInvoice,
        amount: "0x" + args.invoice.amount.toString(16),
        currency: getAsset(args.invoice.asset).typeHash,
        max_fee_amount: "0x100000",
        allow_self_payment: false
      });

      this.notify("routing", "Sending payment on Fiber...");

      // Validate the node returned a usable payment identifier. Some node builds
      // omit `payment_hash` and only expose `payment_id` — try both. If neither
      // is present we cannot poll for status; fail fast with a clear error
      // instead of looping uselessly with an empty hash.
      const paymentHash: string | undefined = sendRes?.payment_hash || sendRes?.paymentHash;
      const paymentId: string | undefined = sendRes?.payment_id || sendRes?.paymentId;
      const pollKey = paymentHash || paymentId;
      if (!pollKey) {
        throw new FiberRpcError(
          "invalid_response",
          "Fiber node accepted the payment but returned no payment_hash or payment_id — cannot track status. Check your node version."
        );
      }
      const pollParams: Record<string, string> = paymentHash
        ? { payment_hash: paymentHash }
        : { payment_id: paymentId! };

      const start = Date.now();
      while (Date.now() - start < 30000) {
        const getRes = await jsonRpcCall<any>({ url: this.url, authToken: this.authToken }, "get_payment", pollParams);

        const status = getRes.status;

        if (status === "Inflight") {
          this.notify("routing", "Sending payment on Fiber...");
        } else if (status === "Settling" || status === "SettlingLightning") {
          this.notify("settling", "Fulfilling Lightning invoice...");
        } else if (status === "Succeeded") {
          return {
            paymentId: getRes.payment_id || paymentId || "pay_" + crypto.randomUUID(),
            fiberTxHash: paymentHash || getRes.payment_hash || pollKey,
            preimage: getRes.preimage || "0x0",
            settledAt: Date.now(),
          };
        } else if (status === "Failed") {
          throw new FiberRpcError(getRes.error_code || "payment_failed", getRes.error_message || "Payment failed on Fiber");
        }

        await new Promise(r => setTimeout(r, 500));
      }

      throw new FiberRpcError("timeout", "Payment status unknown after 30s");
    } catch (err: any) {
      if (err instanceof FiberRpcError) throw err;
      throw new FiberRpcError("unknown", err.message);
    }
  }
}
