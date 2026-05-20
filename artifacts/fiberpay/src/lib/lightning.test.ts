import { describe, it, expect, vi } from "vitest";

// Mock bolt11 so we test the wrapper logic (prefix stripping, error
// shaping, tag extraction) without depending on a real-network invoice
// that could rot or fail checksum validation between bolt11 releases.
// The real bolt11.decode is exercised end-to-end at runtime; what we
// care about here is OUR behavior around it.
vi.mock("bolt11", () => ({
  default: {
    decode: vi.fn((req: string) => {
      if (req === "lnbc1notreallyaninvoice" || req === "lnbc1pinvalid") {
        throw new Error("Unknown coin bech32 prefix");
      }
      // "valid" fixtures return a known shape
      return {
        millisatoshis: "1000000",
        tags: [
          { tagName: "description", data: "Coffee" },
          { tagName: "payment_hash", data: "abcdef1234567890" },
        ],
      };
    }),
  },
}));

const { decodeInvoice, formatUsd, MSAT_TO_USD_RATE } = await import("./lightning");

const VALID_INVOICE_1K_SATS = "lnbc10u1p3pj257ppfakesigfortest";

describe("decodeInvoice", () => {
  it("decodes a valid bolt11 invoice into msat + description + payment_hash", () => {
    const result = decodeInvoice(VALID_INVOICE_1K_SATS);
    expect(result.error).toBeUndefined();
    expect(result.amountMsat).toBe(1_000_000); // 1000 sats
    expect(result.paymentHash).toBe("abcdef1234567890");
    expect(result.description).toBe("Coffee");
    // After successful decode, paymentRequest is normalised (lightning: stripped)
    expect(result.paymentRequest).toBe(VALID_INVOICE_1K_SATS);
  });

  it("strips a `lightning:` URI prefix before decoding", () => {
    const result = decodeInvoice(`lightning:${VALID_INVOICE_1K_SATS}`);
    expect(result.error).toBeUndefined();
    expect(result.amountMsat).toBe(1_000_000);
  });

  it("strips a case-insensitive `Lightning:` prefix", () => {
    const result = decodeInvoice(`LIGHTNING:${VALID_INVOICE_1K_SATS}`);
    expect(result.error).toBeUndefined();
  });

  it("returns a friendly error for non-lightning strings without invoking bolt11", () => {
    const result = decodeInvoice("bitcoin:bc1q...");
    expect(result.amountMsat).toBe(0);
    expect(result.error).toBe("Invalid Lightning invoice format.");
  });

  it("returns a friendly error for an empty string", () => {
    const result = decodeInvoice("");
    expect(result.error).toBe("Invalid Lightning invoice format.");
  });

  it("returns a friendly error when the bolt11 string is malformed (parser throws)", () => {
    const result = decodeInvoice("lnbc1notreallyaninvoice");
    expect(result.amountMsat).toBe(0);
    expect(result.error).toBeDefined();
  });

  it("returns a no-amount error when bolt11 reports a falsy millisatoshis", async () => {
    const bolt11 = (await import("bolt11")).default;
    vi.mocked(bolt11.decode).mockReturnValueOnce({
      millisatoshis: undefined,
      tags: [],
    } as any);
    const result = decodeInvoice("lnbc1amountless");
    expect(result.amountMsat).toBe(0);
    expect(result.error).toBe("Invoice does not specify an amount.");
  });
});

describe("formatUsd", () => {
  it("formats msat to a USD currency string", () => {
    // 1000 sats == 1_000_000 msat. At $110,000/BTC that's $1.10.
    expect(formatUsd(1_000_000)).toBe("$1.10");
  });

  it("returns $0.00 for zero msat", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats sub-cent amounts", () => {
    // 1 sat == 1000 msat. At $110,000/BTC that's ~$0.0011 → rounds to $0.00.
    expect(formatUsd(1000)).toBe("$0.00");
  });

  it("derives the USD rate from the exported constant", () => {
    // Keep the constant honest: if it changes, formatUsd's output changes
    // proportionally.
    expect(MSAT_TO_USD_RATE).toBeCloseTo(110000 / 100_000_000_000, 15);
  });
});
