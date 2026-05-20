import { describe, it, expect } from "vitest";
import { msatToUsd, msatToAssetUnits } from "./conversion";
import { getAsset } from "./assets";
import { MSAT_TO_USD_RATE as MSAT_TO_USD_RATE_PUBLIC } from "../lightning";

describe("msatToUsd", () => {
  it("computes USD at the fixed demo rate ($110,000/BTC)", () => {
    // 100_000_000 sats == 1 BTC == $110,000
    expect(msatToUsd(100_000_000_000)).toBeCloseTo(110_000, 5);
  });

  it("returns 0 for 0 msat", () => {
    expect(msatToUsd(0)).toBe(0);
  });

  it("scales linearly", () => {
    expect(msatToUsd(2_000_000)).toBeCloseTo(msatToUsd(1_000_000) * 2, 9);
  });
});

describe("msatToAssetUnits", () => {
  it("converts msat to RUSD smallest units using the asset's decimals", () => {
    const rusd = getAsset("RUSD");
    // 1000 sats == 1_000_000 msat == $1.10 → 1.10 * 10^decimals.
    const units = msatToAssetUnits(1_000_000, rusd);
    expect(units).toBe(BigInt(Math.floor(1.10 * 10 ** rusd.decimals)));
  });

  it("returns 0n for 0 msat", () => {
    const rusd = getAsset("RUSD");
    expect(msatToAssetUnits(0, rusd)).toBe(0n);
  });

  it("floors fractional smallest-units (never over-credits)", () => {
    const rusd = getAsset("RUSD");
    // 3 msat * 1.1e-6 USD/msat * 10^6 = 3.3 → floor → 3n.
    // The contract we care about: result must be <= the true value.
    const exact = 3 * MSAT_TO_USD_RATE_PUBLIC * 10 ** rusd.decimals;
    const units = msatToAssetUnits(3, rusd);
    expect(units).toBe(BigInt(Math.floor(exact)));
    // And strictly less than the unrounded amount (so we under-credit, not over).
    expect(Number(units)).toBeLessThanOrEqual(exact);
  });
});
