import { describe, it, expect, beforeEach } from "vitest";
import { getFiberClient, switchToMockFiber } from "./client";
import { MockFiberClient } from "./mock-client";
import { useWalletStore } from "@/store/wallet";

describe("getFiberClient", () => {
  beforeEach(() => {
    // Reset wallet store between tests so prior switches don't leak.
    useWalletStore.setState({
      fiberConfig: { mode: "mock", rpcUrl: "", authToken: "" },
    });
  });

  it("returns a MockFiberClient when the wallet is in mock mode", () => {
    const c = getFiberClient();
    expect(c).toBeInstanceOf(MockFiberClient);
  });

  it("returns the SAME cached instance when called twice with unchanged config", () => {
    const a = getFiberClient();
    const b = getFiberClient();
    expect(a).toBe(b);
  });

  it("returns a NEW instance after the config signature changes (rpcUrl)", () => {
    const a = getFiberClient();
    useWalletStore.getState().setFiberConfig({ rpcUrl: "http://new:8228" });
    const b = getFiberClient();
    // Still mock mode, but the cached signature changed → fresh instance.
    expect(a).not.toBe(b);
  });

  it("switchToMockFiber invalidates the cache", () => {
    const a = getFiberClient();
    switchToMockFiber();
    const b = getFiberClient();
    expect(a).not.toBe(b);
  });
});
