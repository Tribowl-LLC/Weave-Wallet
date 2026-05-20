import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FiberInvoice, AssetSymbol } from '../lib/fiber/types';

export interface PendingInvoice {
  lightning: {
    paymentRequest: string;
    amountMsat: number;
    description?: string;
    paymentHash?: string;
  };
  fiber: FiberInvoice;
}

export interface FiberConfig {
  rpcUrl: string;
  authToken: string;
  mode: "real" | "mock";
}

interface WalletState {
  credentialId: string | null;
  userHandle: string | null;
  unlocked: boolean;
  hasOnboarded: boolean;
  installPromptDismissed: boolean;
  pendingInvoice: PendingInvoice | null;
  selectedAsset: AssetSymbol;
  balances: { RUSD: string; USDI: string } | null;
  fiberConfig: FiberConfig;
  setCredential: (credentialId: string, userHandle: string) => void;
  clearCredential: () => void;
  setUnlocked: (unlocked: boolean) => void;
  setHasOnboarded: (v: boolean) => void;
  setInstallPromptDismissed: (v: boolean) => void;
  setPendingInvoice: (invoice: PendingInvoice | null) => void;
  setSelectedAsset: (asset: AssetSymbol) => void;
  setBalances: (balances: { RUSD: string; USDI: string } | null) => void;
  setFiberConfig: (patch: Partial<FiberConfig>) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      credentialId: null,
      userHandle: null,
      unlocked: false,
      hasOnboarded: false,
      installPromptDismissed: false,
      pendingInvoice: null,
      selectedAsset: "RUSD",
      balances: null,
      fiberConfig: { rpcUrl: "http://localhost:8227", authToken: "", mode: "real" },
      setCredential: (credentialId, userHandle) => set({ credentialId, userHandle }),
      clearCredential: () => set({ credentialId: null, userHandle: null, unlocked: false }),
      setUnlocked: (unlocked) => set({ unlocked }),
      setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),
      setInstallPromptDismissed: (installPromptDismissed) => set({ installPromptDismissed }),
      setPendingInvoice: (pendingInvoice) => set({ pendingInvoice }),
      setSelectedAsset: (selectedAsset) => set({ selectedAsset }),
      setBalances: (balances) => set({ balances }),
      setFiberConfig: (patch) => set((state) => ({ fiberConfig: { ...state.fiberConfig, ...patch } })),
      reset: () => set({ credentialId: null, userHandle: null, unlocked: false, pendingInvoice: null, hasOnboarded: false }),
    }),
    {
      name: 'fiberpay-wallet-storage',
      partialize: (state) => ({
        credentialId: state.credentialId,
        userHandle: state.userHandle,
        selectedAsset: state.selectedAsset,
        fiberConfig: state.fiberConfig,
        hasOnboarded: state.hasOnboarded,
        installPromptDismissed: state.installPromptDismissed,
      }),
    }
  )
);
