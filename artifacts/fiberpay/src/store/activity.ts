import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetSymbol } from '../lib/fiber/types';

export type ActivityStatus = "pending" | "settled" | "failed";

export interface ActivityEntry {
  id: string;
  status: ActivityStatus;
  asset: AssetSymbol;
  amount: string;
  amountUsd: number;
  description?: string;
  lightningInvoice: string;
  fiberTxHash?: string;
  preimage?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
  settledAt?: number;
}

interface ActivityState {
  entries: ActivityEntry[];
  addEntry: (entry: ActivityEntry) => void;
  updateEntry: (id: string, patch: Partial<ActivityEntry>) => void;
  clearAll: () => void;
}

export const useActivityStore = create<ActivityState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) => set((state) => ({ entries: [entry, ...state.entries] })),
      updateEntry: (id, patch) => set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e))
      })),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'fiberpay.activity',
    }
  )
);
