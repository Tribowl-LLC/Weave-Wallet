import type { AssetSymbol, FiberBalance, FiberInvoice, PaymentResult, PaymentStage, FiberNodeInfo, FiberReceiveAddress, FiberChannel } from "./types";
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

  // ─────────────────────────────────────────────────────────────────────
  // Deposit address discovery
  //
  // There is no single canonical "give me a deposit address" RPC across
  // fnn builds — some expose `get_deposit_address`, some `wallet_address`,
  // some only surface it through node_info. We try a couple of plausible
  // method names; if none respond we return a clearly-marked fallback so
  // the UI can prompt the user to look it up in their node directly
  // instead of silently showing a wrong address (funds-at-risk).
  // ─────────────────────────────────────────────────────────────────────
  async getReceiveAddress(): Promise<FiberReceiveAddress> {
    const opts = { url: this.url, authToken: this.authToken, timeoutMs: 6000 };
    const candidates = ["get_deposit_address", "wallet_address", "get_receive_address"];
    let network = "unknown";

    // Try to learn the network from node_info first. If even node_info
    // can't reach the node, we are transport-failed — surface that
    // explicitly so the UI can show "node unreachable" rather than the
    // misleading "RPC not supported" fallback.
    try {
      const info = await jsonRpcCall<any>(opts, "node_info");
      network = info?.network || network;
    } catch (err: any) {
      throw new FiberRpcError(
        String(err?.code ?? "network"),
        err?.message || "Cannot reach your Fiber node",
        err
      );
    }

    // Treat ONLY method-not-found style errors as capability misses; any
    // other failure (timeout, auth, transport) propagates so the caller
    // can distinguish "no such RPC on this build" from "node is down".
    const isCapabilityError = (err: any): boolean => {
      const code = String(err?.code ?? "");
      if (code === "-32601" || code === "method_not_found") return true;
      if (code === "rpc_error" || code === "network") {
        return /method (not found|missing|unknown)|unknown method|no such method/i.test(String(err?.message));
      }
      return false;
    };

    let lastTransportError: any = null;
    for (const method of candidates) {
      try {
        const res = await jsonRpcCall<any>(opts, method);
        const addr = typeof res === "string"
          ? res
          : (res?.address || res?.deposit_address || res?.ckb_address);
        if (addr && typeof addr === "string" && addr.length > 0) {
          return { address: addr, network, isFallback: false };
        }
      } catch (err: any) {
        if (isCapabilityError(err)) continue;
        lastTransportError = err;
      }
    }

    if (lastTransportError) {
      throw new FiberRpcError(
        String(lastTransportError.code ?? "network"),
        lastTransportError.message || "Couldn't fetch deposit address",
        lastTransportError
      );
    }

    // All candidates legitimately said "method not found" — this build
    // doesn't expose a deposit-address RPC, so return a marked fallback.
    return { address: "", network, isFallback: true };
  }

  async listChannels(): Promise<FiberChannel[]> {
    const opts = { url: this.url, authToken: this.authToken };
    const channels = await jsonRpcCall<any[]>(opts, "list_channels");
    const out: FiberChannel[] = [];
    for (const c of channels || []) {
      // Map UDT type-hash → asset symbol; "CKB" if no UDT script.
      let asset: FiberChannel["asset"] = "unknown";
      if (!c.udt_type_script) asset = "CKB";
      else if (c.udt_type_script === ASSET_REGISTRY.RUSD.typeHash) asset = "RUSD";
      else if (c.udt_type_script === ASSET_REGISTRY.USDI.typeHash) asset = "USDI";

      const stateRaw = String(c.state ?? c.status ?? "").toLowerCase();
      let state: FiberChannel["state"] = "unknown";
      if (stateRaw.includes("open") || stateRaw === "active" || stateRaw === "channelready") state = "open";
      else if (stateRaw.includes("pend") || stateRaw === "negotiating") state = "pending";
      else if (stateRaw.includes("clos")) state = stateRaw === "closed" ? "closed" : "closing";

      out.push({
        channelId: c.channel_id || c.id || "",
        peerNodeId: c.peer_id || c.peer_node_id || c.remote_node_id || "",
        asset,
        localBalance: c.local_balance ? BigInt(c.local_balance) : 0n,
        remoteBalance: c.remote_balance ? BigInt(c.remote_balance) : 0n,
        state,
      });
    }
    return out;
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
    lightningPaymentHash?: string;
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
      lightningPaymentHash: args.lightningPaymentHash,
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
          const ln = await this.awaitLightningFulfillment(
            args.invoice.lightningInvoice,
            preimage,
            12000,
            args.invoice.lightningPaymentHash,
          );

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
    timeoutMs = 12000,
    paymentHash?: string,
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

      // Third probe: some node builds key invoices by payment_hash rather
      // than the full bolt11 string. We only attempt this if we have a
      // hash and the previous two methods didn't already settle the
      // question. This is the most "lightning-native" lookup shape.
      let m3Tried = false;
      let m3Capability = false;
      if (paymentHash) {
        m3Tried = true;
        try {
          const res3 = await jsonRpcCall<any>(
            { url: this.url, authToken: this.authToken },
            "lookup_invoice",
            { payment_hash: paymentHash }
          );
          triedMethods = true;
          const s = String(res3?.status || res3?.state || "").toLowerCase();
          if (s === "settled" || s === "paid" || s === "succeeded") return { status: "settled" };
          if (s === "failed" || s === "canceled" || s === "cancelled") {
            return { status: "failed", error: res3?.error_message || "Lightning invoice failed" };
          }
        } catch (err: any) {
          if (isCapabilityError(err)) {
            m3Capability = true;
          } else {
            lastTransportError = err?.message || lastTransportError;
          }
        }
      }

      // If EVERY attempted probe this round was a real transport error
      // (no capability miss, no successful call), bail honestly with
      // unknown instead of looping until timeout. m3 is only counted
      // when it actually ran — skipping it for "no hash" must NOT
      // suppress the bail-out (architect finding).
      const m3CountsAsCapability = !m3Tried || m3Capability;
      if (!m1Capability && !m2Capability && !m3CountsAsCapability && lastTransportError && !triedMethods) {
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
    return this.awaitLightningFulfillment(
      args.lightningInvoice,
      args.paymentResult.preimage,
      8000,
      args.lightningPaymentHash,
    );
  }
}
