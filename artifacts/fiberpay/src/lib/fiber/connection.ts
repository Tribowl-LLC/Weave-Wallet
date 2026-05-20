import type { FiberConnectionState, FiberMode, FiberConnectionStatus } from "./types";

let state: FiberConnectionState = {
  mode: "mock",
  status: "connected",
  endpoint: null,
  nodeInfo: null,
  lastError: null,
};

const listeners = new Set<(s: FiberConnectionState) => void>();

export function getFiberConnection(): FiberConnectionState {
  return state;
}

export function subscribeFiberConnection(handler: (s: FiberConnectionState) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function setFiberConnection(patch: Partial<FiberConnectionState>): void {
  state = { ...state, ...patch };
  listeners.forEach(h => h(state));
}
