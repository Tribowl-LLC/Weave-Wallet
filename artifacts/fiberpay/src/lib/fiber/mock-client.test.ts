import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockFiberClient, FiberError } from "./mock-client";
import type { PaymentStage } from "./types";

// All randomness in mock-client comes from `Math.random()`. We stub it
// per-test so the success/pending/failed branches are deterministic and
// we don't depend on flaky luck for assertions.
function withRandom<T>(values: number[], fn: () => Promise<T>): Promise<T> {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i] ?? values[values.length - 1];
    i++;
    return v;
  });
  return fn();
}

describe("MockFiberClient", () => {
  let client: MockFiberClient;

  beforeEach(() => {
    client = new MockFiberClient();
    // The mock client uses `setTimeout` to simulate network latency. Real
    // delays would push the suite past 30s and add flake risk; resolving
    // every timeout synchronously keeps tests deterministic and instant
    // without changing the production code path under test.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  describe("getBalances", () => {
    it("returns persisted balances from localStorage when present", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "500000000");
      localStorage.setItem("fiberpay.balances.USDI", "200000000");
      const balances = await withRandom([0], () => client.getBalances());
      expect(balances.find(b => b.asset === "RUSD")?.amount).toBe(500_000000n);
      expect(balances.find(b => b.asset === "USDI")?.amount).toBe(200_000000n);
    });

    it("returns the seed defaults when storage is empty", async () => {
      const balances = await withRandom([0], () => client.getBalances());
      expect(balances.find(b => b.asset === "RUSD")?.amount).toBeGreaterThan(0n);
      expect(balances.find(b => b.asset === "USDI")?.amount).toBeGreaterThan(0n);
    });
  });

  describe("createInvoiceFromLightning", () => {
    it("returns a Fiber invoice with id, amount, hash, and threaded LN payment_hash", async () => {
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc100u1p...",
        amountMsat: 1_000_000,
        description: "Coffee",
        asset: "RUSD",
        lightningPaymentHash: "deadbeef",
      });
      expect(invoice.invoiceId).toMatch(/^fbi_/);
      expect(invoice.asset).toBe("RUSD");
      expect(invoice.amount).toBeGreaterThan(0n);
      expect(invoice.amountUsd).toBeGreaterThan(0);
      expect(invoice.paymentHash).toMatch(/^0x[0-9a-f]+$/);
      expect(invoice.lightningInvoice).toBe("lnbc100u1p...");
      expect(invoice.lightningPaymentHash).toBe("deadbeef");
      expect(invoice.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe("sendPayment — happy path", () => {
    it("settles successfully when randomness lands in the 85% bucket", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "1000000000");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000,
        asset: "RUSD",
      });

      const stages: PaymentStage[] = [];
      const unsub = client.onStage((s) => stages.push(s));

      // [routing-refund roll, settling-refund roll, final-status roll]
      // Pick > 0.05, > 0.03, < 0.85 for clean settled path.
      const result = await withRandom([0.5, 0.5, 0.1], () =>
        client.sendPayment({ invoice, signedAuthorization: "sig" })
      );

      expect(result.lightningStatus).toBe("settled");
      expect(result.fiberTxHash).toMatch(/^0x/);
      expect(result.preimage).toMatch(/^0x/);
      expect(stages).toContain("creating_invoice");
      expect(stages).toContain("routing");
      expect(stages).toContain("settling");
      expect(stages).toContain("awaiting_lightning");
      expect(stages).toContain("settled");
      unsub();
    });

    it("reports lightningStatus 'pending' for the 10% bucket", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "1000000000");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000, asset: "RUSD",
      });
      const result = await withRandom([0.5, 0.5, 0.9], () =>
        client.sendPayment({ invoice, signedAuthorization: "sig" })
      );
      expect(result.lightningStatus).toBe("pending");
    });

    it("reports lightningStatus 'failed' for the bottom 5% bucket", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "1000000000");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000, asset: "RUSD",
      });
      const result = await withRandom([0.5, 0.5, 0.99], () =>
        client.sendPayment({ invoice, signedAuthorization: "sig" })
      );
      expect(result.lightningStatus).toBe("failed");
      expect(result.lightningError).toBeTruthy();
    });
  });

  describe("sendPayment — error paths", () => {
    it("throws insufficient_balance and does NOT mutate storage", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "0");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000, asset: "RUSD",
      });
      await expect(
        client.sendPayment({ invoice, signedAuthorization: "sig" })
      ).rejects.toBeInstanceOf(FiberError);
      // Balance untouched.
      expect(localStorage.getItem("fiberpay.balances.RUSD")).toBe("0");
    });

    it("refunds the balance when the Fiber routing leg fails", async () => {
      localStorage.setItem("fiberpay.balances.RUSD", "1000000000");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000, asset: "RUSD",
      });
      // First roll < 0.05 → trip the routing-failure branch.
      await expect(
        withRandom([0.01], () =>
          client.sendPayment({ invoice, signedAuthorization: "sig" })
        )
      ).rejects.toMatchObject({ code: "routing_failed" });

      // Balance should be back to its original value (refunded).
      expect(localStorage.getItem("fiberpay.balances.RUSD")).toBe("1000000000");
    });

    it("refunds the balance when the Lightning settlement leg fails", async () => {
      // Distinct from routing_failed: the Fiber side routed fine, but the
      // Lightning fulfillment threw mid-flight. The node still owes the
      // user their funds back. This is the harder of the two refund
      // branches because it happens AFTER the balance has been debited
      // AND the first random gate has been passed.
      localStorage.setItem("fiberpay.balances.RUSD", "1000000000");
      const invoice = await client.createInvoiceFromLightning({
        lightningInvoice: "lnbc...", amountMsat: 1_000_000, asset: "RUSD",
      });
      // First roll > 0.05 (skip routing-failure), second roll < 0.03
      // (trip lightning-settlement-failure refund branch).
      await expect(
        withRandom([0.5, 0.01], () =>
          client.sendPayment({ invoice, signedAuthorization: "sig" })
        )
      ).rejects.toMatchObject({ code: "lightning_failed" });

      expect(localStorage.getItem("fiberpay.balances.RUSD")).toBe("1000000000");
    });
  });

  describe("retryLightningFulfillment", () => {
    it("returns 'settled' when randomness is below the resolution threshold", async () => {
      const res = await withRandom([0.1], () =>
        client.retryLightningFulfillment({
          paymentResult: {
            paymentId: "p", fiberTxHash: "0x", preimage: "0x",
            settledAt: Date.now(), lightningStatus: "pending",
          },
          lightningInvoice: "lnbc...",
        })
      );
      expect(res.status).toBe("settled");
    });

    it("returns 'pending' when randomness is above the threshold", async () => {
      const res = await withRandom([0.9], () =>
        client.retryLightningFulfillment({
          paymentResult: {
            paymentId: "p", fiberTxHash: "0x", preimage: "0x",
            settledAt: Date.now(), lightningStatus: "pending",
          },
          lightningInvoice: "lnbc...",
        })
      );
      expect(res.status).toBe("pending");
    });

    it("preserves the 'failed' state on retry (refund already issued)", async () => {
      const res = await client.retryLightningFulfillment({
        paymentResult: {
          paymentId: "p", fiberTxHash: "0x", preimage: "0x",
          settledAt: Date.now(), lightningStatus: "failed",
          lightningError: "no route",
        },
        lightningInvoice: "lnbc...",
      });
      expect(res.status).toBe("failed");
      expect(res.error).toBe("no route");
    });
  });
});
