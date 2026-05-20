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
          const preimage = getRes.preimage || "0x0";
          const finalPaymentId = getRes.payment_id || paymentId || "pay_" + crypto.randomUUID();
          const finalFiberTx = paymentHash || getRes.payment_hash || pollKey;

          // Fiber side is settled. Now verify the Lightning leg actually
          // fulfilled on the OTHER network. This is best-effort: most node
          // builds don't expose a single canonical RPC for "did the
          // bridged Lightning invoice settle", so we try a couple of
          // plausible methods. Either way the answer is informational —
          // the wallet caller decides how to surface partial-failure.
          this.notify("awaiting_lightning", "Confirming Lightning settlement...");
          const ln = await this.awaitLightningFulfillment(args.invoice.lightningInvoice, preimage);

          return {
            paymentId: finalPaymentId,
            fiberTxHash: finalFiberTx,
            preimage,
            settledAt: Date.now(),
            lightningStatus: ln.status,
            lightningError: ln.error,
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

  // ─────────────────────────────────────────────────────────────────────
  // Lightning fulfillment verification
  //
  // After the Fiber leg settles we need to know whether the original
  // Lightning invoice was actually paid. In the HTLC-equivalence model
  // this happens automatically (the preimage that unlocked Fiber also
  // unlocks the Lightning HTLC). In a submarine-swap model the node
  // bridges asynchronously and we may briefly observe a "pending"
  // state. Either way the AUTHORITATIVE answer lives on the node, not
  // in the PWA — we just poll.
  //
  // TODO: replace with whichever RPC the operator's fnn build actually
  // exposes (`get_lightning_invoice`, `wait_invoice`, `lookup_invoice`,
  // gRPC subscriptions, etc.). The current implementation tries two
  // plausible method names and falls back to "unknown" so the wallet
  // can still surface a useful UX rather than crashing.
  // ─────────────────────────────────────────────────────────────────────
  private async awaitLightningFulfillment(
    lightningInvoice: string,
    preimage: string,
    timeoutMs = 12000
  ): Promise<{ status: "settled" | "pending" | "failed" | "unknown"; error?: string }> {
    const start = Date.now();
    let triedMethods = false;
    let lastTransportError: string | undefined;

    // jsonRpcCall normalizes JSON-RPC error codes to STRINGS (see json-rpc.ts:
    // `code?.toString()`), so we compare against the string form. We also
    // match the textual "method_not_found" alias that some node builds emit.
    const isCapabilityError = (err: any): boolean => {
      const code = String(err?.code ?? "");
      if (code === "-32601" || code === "method_not_found") return true;
      // Some builds wrap method-missing as a generic message; only fall back
      // to the textual heuristic when the code is generic.
      if (code === "rpc_error" || code === "network") {
        return /method (not found|missing|unknown)|unknown method|no such method/i.test(String(err?.message));
      }
      return false;
    };

    while (Date.now() - start < timeoutMs) {
      let m1Capability = false;
      let m2Capability = false;

      try {
        const res = await jsonRpcCall<any>(
          { url: this.url, authToken: this.authToken },
          "get_lightning_invoice",
          { invoice: lightningInvoice }
        );
        triedMethods = true;
        const s = String(res?.status || res?.state || "").toLowerCase();
        if (s === "settled" || s === "paid" || s === "succeeded") return { status: "settled" };
        if (s === "failed" || s === "canceled" || s === "cancelled") {
          return { status: "failed", error: res?.error_message || "Lightning invoice failed" };
        }
        // anything else (open/pending/accepted) → keep polling
      } catch (err: any) {
        if (isCapabilityError(err)) {
          m1Capability = true;
        } else {
          // Real transport / RPC error. Remember it and try the fallback;
          // if BOTH methods fail with transport errors in this iteration
          // we'll bail with unknown rather than spin pointlessly.
          lastTransportError = err?.message || lastTransportError;
        }
      }

      // Fallback method name some builds use
      try {
        const res2 = await jsonRpcCall<any>(
          { url: this.url, authToken: this.authToken },
          "lookup_invoice",
          { payment_request: lightningInvoice }
        );
        triedMethods = true;
        const s = String(res2?.status || res2?.state || "").toLowerCase();
        if (s === "settled" || s === "paid" || s === "succeeded") return { status: "settled" };
        if (s === "failed" || s === "canceled" || s === "cancelled") {
          return { status: "failed", error: res2?.error_message || "Lightning invoice failed" };
        }
      } catch (err: any) {
        if (isCapabilityError(err)) {
          m2Capability = true;
        } else {
          lastTransportError = err?.message || lastTransportError;
        }
      }

      // If BOTH attempts in this round were real transport errors (neither
      // a capability miss nor a successful call), we can't verify — bail
      // honestly with unknown instead of looping until timeout.
      if (!m1Capability && !m2Capability && lastTransportError && !triedMethods) {
        return { status: "unknown", error: lastTransportError };
      }

      await new Promise(r => setTimeout(r, 750));
    }

    // Timed out. If no method ever responded successfully, we genuinely
    // cannot tell. Even if Fiber returned a non-zero preimage, atomicity
    // is a NODE guarantee we have not independently confirmed — report
    // unknown rather than implying confirmation we didn't get.
    if (!triedMethods) return { status: "unknown", error: lastTransportError };
    return { status: "pending" };
  }

  async retryLightningFulfillment(args: {
    paymentResult: PaymentResult;
    lightningInvoice: string;
    lightningPaymentHash?: string;
  }): Promise<{ status: "settled" | "pending" | "failed" | "unknown"; error?: string }> {
    return this.awaitLightningFulfillment(args.lightningInvoice, args.paymentResult.preimage, 8000);
  }
}
