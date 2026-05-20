import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberNodeInfo } from "./types";
import { FiberRpcError } from "./types";
import type { FiberClient } from "./client";
import { jsonRpcCall } from "./json-rpc";
import { getAsset, ASSET_REGISTRY } from "./assets";
import { msatToAssetUnits, msatToUsd } from "./conversion";

export class RealFiberClient implements FiberClient {
  private handlers = new Set<(stage: PaymentStage, detail?: string) => void>();
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  onStage(handler: (stage: PaymentStage, detail?: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify(stage: PaymentStage, detail?: string) {
    this.handlers.forEach(h => h(stage, detail));
  }

  async getNodeInfo(): Promise<FiberNodeInfo> {
    // TODO: verify method name against Fiber RPC docs
    const result = await jsonRpcCall<any>({ url: this.url }, "node_info");
    return {
      nodeId: result?.node_id || "unknown",
      version: result?.version || "unknown",
      network: result?.network || "unknown",
      channelCount: result?.channel_count || 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await jsonRpcCall({ url: this.url, timeoutMs: 5000 }, "node_info");
      return true;
    } catch (err) {
      return false;
    }
  }

  async getBalances(): Promise<FiberBalance[]> {
    // TODO: verify method name against Fiber RPC docs
    const channels = await jsonRpcCall<any[]>({ url: this.url }, "list_channels");
    
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
    const assetInfo = getAsset(args.asset);
    const amount = msatToAssetUnits(args.amountMsat, assetInfo);
    const amountUsd = msatToUsd(args.amountMsat);
    
    // TODO: verify method name against Fiber RPC docs
    const response = await jsonRpcCall<any>({ url: this.url }, "new_invoice", {
      amount: "0x" + amount.toString(16),
      currency: assetInfo.typeHash,
      description: args.description || "",
      expiry: 300
    });

    return {
      invoiceId: response.invoice_id || response.payment_hash || "fbi_" + crypto.randomUUID(),
      asset: args.asset,
      amount,
      amountUsd,
      expiresAt: Date.now() + 300 * 1000,
      paymentHash: response.payment_hash,
      description: args.description,
      lightningInvoice: args.lightningInvoice,
    };
  }

  async sendPayment(args: {
    invoice: FiberInvoice;
    signedAuthorization: string;
  }): Promise<PaymentResult> {
    try {
      this.notify("routing", "Finding route on Fiber network...");
      
      // TODO: verify method name against Fiber RPC docs
      const sendRes = await jsonRpcCall<any>({ url: this.url }, "send_payment", {
        invoice: args.invoice.invoiceId,
        lightning_invoice: args.invoice.lightningInvoice,
        max_fee_amount: "0x100000",
        allow_self_payment: false
      });
      
      const paymentHash = sendRes.payment_hash || args.invoice.paymentHash;
      
      const start = Date.now();
      while (Date.now() - start < 30000) {
        // TODO: verify method name against Fiber RPC docs
        const getRes = await jsonRpcCall<any>({ url: this.url }, "get_payment", {
          payment_hash: paymentHash
        });
        
        const status = getRes.status;
        
        if (status === "Inflight") {
          this.notify("routing", "Finding route on Fiber network...");
        } else if (status === "Settling" || status === "SettlingLightning") {
          this.notify("settling", "Settling via Lightning...");
        } else if (status === "Succeeded") {
          return {
            paymentId: getRes.payment_id || "pay_" + crypto.randomUUID(),
            fiberTxHash: paymentHash,
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
