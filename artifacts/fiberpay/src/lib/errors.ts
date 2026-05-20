// Central error → user-facing message mapper.
//
// The wallet talks to a Fiber node over JSON-RPC, decodes bolt11
// invoices, talks to WebAuthn, etc. — every layer can throw, and the
// raw messages are written for developers ("ECONNREFUSED", JSON-RPC
// code -32601, etc). Surfacing those directly to a non-technical user
// is a UX failure. This helper turns any caught error into a short,
// honest sentence we can show in a toast or a banner.
//
// Design goals:
//   1. Never echo raw RPC messages. Translate codes we know, summarise
//      shapes we recognise, fall back to a friendly default otherwise.
//   2. Always be honest. "Couldn't reach your node" is fine; "Payment
//      succeeded" when we don't know that is NOT fine.
//   3. Caller can request `includeRaw` (e.g. for an Activity drawer
//      where the raw text is useful for debugging) without it leaking
//      into the main toast.

import { FiberRpcError, FiberError } from "./fiber/client";

export interface FriendlyError {
  message: string;             // user-facing sentence
  code: string;                // stable machine code for analytics / retry logic
  retryable: boolean;          // hint for the UI (show a "Try again" button?)
  raw?: string;                // original technical message, opt-in
}

// Timeout is intentionally NOT in this set — it gets its own copy
// further down so we can say "took too long" instead of "can't reach".
const NETWORK_CODES = new Set([
  "network", "unreachable", "ECONNREFUSED", "ECONNRESET",
  "ENETUNREACH", "fetch_failed",
]);

// Only true JSON-RPC method-not-found / capability misses belong here.
// The generic "rpc_error" fallback used by json-rpc.ts when a node
// returns an error without a code must NOT be classified as "unsupported"
// — that would mislead users whose node is reachable but unhappy.
const CAPABILITY_CODES = new Set([
  "-32601", "method_not_found",
]);

export function friendlyError(err: unknown, opts?: { includeRaw?: boolean }): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const includeRaw = opts?.includeRaw ?? false;
  const withRaw = (out: Omit<FriendlyError, "raw">): FriendlyError =>
    includeRaw ? { ...out, raw } : out;

  // Browser offline — checked first since it dominates everything else.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return withRaw({
      message: "You're offline. Reconnect to the internet and try again.",
      code: "offline",
      retryable: true,
    });
  }

  // WebAuthn / passkey errors
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return withRaw({
        message: "Biometric prompt was cancelled.",
        code: "auth_cancelled",
        retryable: true,
      });
    }
    if (err.name === "SecurityError") {
      return withRaw({
        message: "This browser blocked the biometric prompt for security reasons.",
        code: "auth_security",
        retryable: false,
      });
    }
  }

  if (err instanceof FiberRpcError) {
    const code = String(err.code);

    // Order matters: check the most-specific shapes first.
    if (code === "timeout" || code === "ETIMEDOUT") {
      return withRaw({
        message: "Your node took too long to respond. Try again in a moment.",
        code: "timeout",
        retryable: true,
      });
    }
    // HTTP-layer 401 surfaces as code "network" with "HTTP error 401"
    // in the message (see json-rpc.ts), so we sniff the message too.
    if (
      code === "unauthorized" || code === "auth_failed" || code === "401" ||
      /HTTP error 401|HTTP error 403|unauthor/i.test(err.message)
    ) {
      return withRaw({
        message: "Your node rejected the auth token. Update it in Settings.",
        code: "auth_rejected",
        retryable: false,
      });
    }
    if (NETWORK_CODES.has(code) || /HTTP error 5\d\d/i.test(err.message)) {
      return withRaw({
        message: "Can't reach your Fiber node. Check that it's running and the URL is correct.",
        code: "node_unreachable",
        retryable: true,
      });
    }
    if (code === "insufficient_balance" || /insufficient/i.test(err.message)) {
      return withRaw({
        message: "Not enough balance for this payment.",
        code: "insufficient_balance",
        retryable: false,
      });
    }
    if (code === "payment_failed" || /no route|route not found|unable to find/i.test(err.message)) {
      return withRaw({
        message: "Your node couldn't find a route to settle this payment.",
        code: "no_route",
        retryable: true,
      });
    }
    if (CAPABILITY_CODES.has(code)) {
      return withRaw({
        message: "Your node doesn't support this action. Check that you're on a recent Fiber build.",
        code: "unsupported_rpc",
        retryable: false,
      });
    }
    // Last resort: keep it generic, never leak raw RPC text.
    return withRaw({
      message: "Your Fiber node returned an error. Check its logs for details.",
      code: code || "rpc_error",
      retryable: true,
    });
  }

  if (err instanceof FiberError) {
    if (err.code === "insufficient_balance") {
      return withRaw({
        message: "Not enough balance for this payment.",
        code: err.code,
        retryable: false,
      });
    }
    return withRaw({
      message: err.message || "Something went wrong.",
      code: err.code || "fiber_error",
      retryable: true,
    });
  }

  // Common bolt11 decode shapes
  if (/invalid|decode|checksum|bolt11/i.test(raw)) {
    return withRaw({
      message: "That doesn't look like a valid Lightning invoice.",
      code: "invalid_invoice",
      retryable: false,
    });
  }

  // Generic fetch-style failures (e.g. dev preview proxy down)
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return withRaw({
      message: "Network request failed. Check your connection and try again.",
      code: "fetch_failed",
      retryable: true,
    });
  }

  return withRaw({
    message: "Something went wrong. Please try again.",
    code: "unknown",
    retryable: true,
  });
}
