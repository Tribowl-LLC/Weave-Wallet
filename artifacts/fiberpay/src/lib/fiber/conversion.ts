import { MSAT_TO_USD_RATE } from "../lightning";
import type { Asset } from "./types";

export function msatToUsd(amountMsat: number): number {
  return amountMsat * MSAT_TO_USD_RATE;
}

export function msatToAssetUnits(amountMsat: number, asset: Asset): bigint {
  const amountUsd = msatToUsd(amountMsat);
  const multiplier = 10 ** asset.decimals;
  return BigInt(Math.floor(amountUsd * multiplier));
}
