import { describe, it, expect, vi } from "vitest";
import {
  getFiberConnection,
  setFiberConnection,
  subscribeFiberConnection,
} from "./connection";

describe("fiber connection store", () => {
  it("starts in mock + connected by default", () => {
    const s = getFiberConnection();
    expect(s.mode).toBe("mock");
    expect(s.status).toBe("connected");
    expect(s.endpoint).toBeNull();
  });

  it("setFiberConnection patches state immutably", () => {
    const before = getFiberConnection();
    setFiberConnection({ status: "connecting", endpoint: "http://localhost:8228" });
    const after = getFiberConnection();
    expect(after.status).toBe("connecting");
    expect(after.endpoint).toBe("http://localhost:8228");
    // Original snapshot should not be mutated.
    expect(before.status).not.toBe("connecting");
  });

  it("notifies subscribers on every patch", () => {
    const handler = vi.fn();
    const unsub = subscribeFiberConnection(handler);
    setFiberConnection({ status: "connected" });
    setFiberConnection({ status: "error", lastError: "boom" });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "error", lastError: "boom" })
    );
    unsub();
  });

  it("stops notifying after unsubscribe", () => {
    const handler = vi.fn();
    const unsub = subscribeFiberConnection(handler);
    unsub();
    setFiberConnection({ status: "connecting" });
    expect(handler).not.toHaveBeenCalled();
  });
});
