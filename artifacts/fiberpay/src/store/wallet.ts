import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FiberInvoice, AssetSymbol } from '../lib/fiber/types';

export interface PendingInvoice {
  lightning: {
    paymentRequest: string;
    amountMsat: number;
    description?: string;
  };
  fiber: FiberInvoice;
}

interface WalletState {
  credentialId: string | null;
  userHandle: string | null;
  unlocked: boolean;
  pendingInvoice: PendingInvoice | null;
  selectedAsset: AssetSymbol;
  balances: { RUSD: string; USDI: string } | null;
  setCredential: (credentialId: string, userHandle: string) => void;
  clearCredential: () => void;
  setUnlocked: (unlocked: boolean) => void;
  setPendingInvoice: (invoice: PendingInvoice | null) => void;
  setSelectedAsset: (asset: AssetSymbol) => void;
  setBalances: (balances: { RUSD: string; USDI: string } | null) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      credentialId: null,
      userHandle: null,
      unlocked: false,
      pendingInvoice: null,
      selectedAsset: "RUSD",
      balances: null,
      setCredential: (credentialId, userHandle) => set({ credentialId, userHandle }),
      clearCredential: () => set({ credentialId: null, userHandle: null, unlocked: false }),
      setUnlocked: (unlocked) => set({ unlocked }),
      setPendingInvoice: (pendingInvoice) => set({ pendingInvoice }),
      setSelectedAsset: (selectedAsset) => set({ selectedAsset }),
      setBalances: (balances) => set({ balances }),
      reset: () => set({ credentialId: null, userHandle: null, unlocked: false, pendingInvoice: null }),
    }),
    {
      name: 'fiberpay-wallet-storage',
      partialize: (state) => ({
        credentialId: state.credentialId,
        userHandle: state.userHandle,
        selectedAsset: state.selectedAsset,
      }),
    }
  )
);
