import type { Asset, AssetSymbol } from "./types";

export const ASSET_REGISTRY: Record<AssetSymbol, Asset> = {
  RUSD: {
    symbol: "RUSD",
    name: "Rusd Stablecoin",
    decimals: 6,
    typeHash: "0x8a6b4129b867c268a7ef9f3a9e3e7f4c3a190b2b8c5f2b874c96d912a7d4e321",
    network: "fiber",
    iconColor: "#16C953", // volt-green
  },
  USDI: {
    symbol: "USDI",
    name: "USDI Token",
    decimals: 6,
    typeHash: "0xc1b9f71c4c1a2e854d6a8e9f2a92c3f8f10b7a8a68b42f65f3d790d97150c18d",
    network: "fiber",
    iconColor: "#38bdf8", // sky-400
  }
};

export function getAsset(symbol: AssetSymbol): Asset {
  return ASSET_REGISTRY[symbol];
}
