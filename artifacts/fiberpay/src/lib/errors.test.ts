import { describe, it, expect, beforeEach } from "vitest";
import { friendlyError } from "./errors";
import { FiberRpcError } from "./fiber/types";
import { FiberError } from "./fiber/mock-client";

describe("friendlyError", () => {
  beforeEach(() => {
    // Make every test deterministic — most cases need the browser to be
    // "online" or the offline short-circuit fires before any other check.
    Object.defineProperty(navigator, "onLine", {
      value: true, writable: true, configurable: true,
    });
  });

  it("short-circuits to offline when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false, writable: true, configurable: true,
    });
    const r = friendlyError(new FiberRpcError("network", "anything"));
    expect(r.code).toBe("offline");
    expect(r.message).toMatch(/offline/i);
    expect(r.retryable).toBe(true);
  });

  it("maps FiberRpcError 'timeout' to its own copy (not 'unreachable')", () => {
    // Regression: an earlier version had `timeout` inside NETWORK_CODES,
    // which made the timeout-specific branch dead code. Keep it specific.
    const r = friendlyError(new FiberRpcError("timeout", "Request timed out"));
    expect(r.code).toBe("timeout");
    expect(r.message).toMatch(/took too long/i);
  });

  it("maps FiberRpcError 'network' to a node-unreachable message", () => {
    const r = friendlyError(new FiberRpcError("network", "ECONNREFUSED"));
    expect(r.code).toBe("node_unreachable");
    expect(r.message).toMatch(/can't reach your fiber node/i);
  });

  it("maps a wrapped HTTP 401 (code 'network' + 'HTTP error 401' msg) to auth_rejected", () => {
    // json-rpc.ts wraps HTTP failures as FiberRpcError("network", "HTTP error 401 ..."),
    // so the friendly mapper must sniff the message body, not just the code.
    const r = friendlyError(new FiberRpcError("network", "HTTP error 401 Unauthorized"));
    expect(r.code).toBe("auth_rejected");
    expect(r.message).toMatch(/auth token/i);
    expect(r.retryable).toBe(false);
  });

  it("maps HTTP 5xx wrapped as 'network' to node_unreachable, not auth", () => {
    const r = friendlyError(new FiberRpcError("network", "HTTP error 503 Service Unavailable"));
    expect(r.code).toBe("node_unreachable");
  });

  it("maps -32601 method-not-found to an unsupported_rpc message", () => {
    const r = friendlyError(new FiberRpcError("-32601", "Method not found"));
    expect(r.code).toBe("unsupported_rpc");
    expect(r.message).toMatch(/doesn't support/i);
  });

  it("does NOT classify the generic 'rpc_error' code as unsupported_rpc", () => {
    // json-rpc.ts uses "rpc_error" as the fallback when a node returns
    // an error without a code. That's a real failure, not a capability
    // miss — must not be mis-labeled.
    const r = friendlyError(new FiberRpcError("rpc_error", "something went wrong"));
    expect(r.code).not.toBe("unsupported_rpc");
    expect(r.code).toBe("rpc_error");
    expect(r.message).not.toMatch(/doesn't support/i);
  });

  it("maps insufficient_balance via FiberError", () => {
    const r = friendlyError(new FiberError("insufficient_balance", "Not enough"));
    expect(r.code).toBe("insufficient_balance");
    expect(r.message).toMatch(/not enough balance/i);
    expect(r.retryable).toBe(false);
  });

  it("sniffs 'no route' messages and maps to no_route", () => {
    const r = friendlyError(new FiberRpcError("payment_failed", "no route found to destination"));
    expect(r.code).toBe("no_route");
    expect(r.retryable).toBe(true);
  });

  it("maps DOMException NotAllowedError to a cancelled-passkey message", () => {
    const r = friendlyError(new DOMException("cancelled", "NotAllowedError"));
    expect(r.code).toBe("auth_cancelled");
    expect(r.message).toMatch(/cancelled/i);
  });

  it("treats bolt11-decode-shaped errors as invalid_invoice", () => {
    const r = friendlyError(new Error("Invalid checksum at position 42"));
    expect(r.code).toBe("invalid_invoice");
    expect(r.message).toMatch(/valid lightning invoice/i);
  });

  it("treats generic 'Failed to fetch' as fetch_failed", () => {
    const r = friendlyError(new TypeError("Failed to fetch"));
    expect(r.code).toBe("fetch_failed");
    expect(r.retryable).toBe(true);
  });

  it("falls back to a generic 'unknown' for unrecognised errors", () => {
    const r = friendlyError(new Error("something bizarre"));
    expect(r.code).toBe("unknown");
    expect(r.message).toMatch(/something went wrong/i);
  });

  it("never includes raw text by default", () => {
    const r = friendlyError(new FiberRpcError("network", "ECONNREFUSED 127.0.0.1:8123"));
    expect(r.raw).toBeUndefined();
  });

  it("includes raw text only when explicitly requested", () => {
    const r = friendlyError(new FiberRpcError("network", "ECONNREFUSED 127.0.0.1:8123"), { includeRaw: true });
    expect(r.raw).toBe("ECONNREFUSED 127.0.0.1:8123");
  });

  it("handles non-Error inputs without throwing", () => {
    expect(friendlyError(null).code).toBe("unknown");
    expect(friendlyError(undefined).code).toBe("unknown");
    expect(friendlyError("a plain string").code).toBe("unknown");
  });
});
