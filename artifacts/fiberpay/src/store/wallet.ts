import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PendingInvoice {
  paymentRequest: string;
  amountMsat: number;
  description?: string;
}

interface WalletState {
  credentialId: string | null;
  userHandle: string | null;
  unlocked: boolean;
  pendingInvoice: PendingInvoice | null;
  setCredential: (credentialId: string, userHandle: string) => void;
  clearCredential: () => void;
  setUnlocked: (unlocked: boolean) => void;
  setPendingInvoice: (invoice: PendingInvoice | null) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      credentialId: null,
      userHandle: null,
      unlocked: false,
      pendingInvoice: null,
      setCredential: (credentialId, userHandle) => set({ credentialId, userHandle }),
      clearCredential: () => set({ credentialId: null, userHandle: null, unlocked: false }),
      setUnlocked: (unlocked) => set({ unlocked }),
      setPendingInvoice: (pendingInvoice) => set({ pendingInvoice }),
      reset: () => set({ credentialId: null, userHandle: null, unlocked: false, pendingInvoice: null }),
    }),
    {
      name: 'fiberpay-wallet-storage',
      partialize: (state) => ({
        credentialId: state.credentialId,
        userHandle: state.userHandle,
      }),
    }
  )
);
