export interface JsonRpcOptions {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

let nextId = 1;

export async function jsonRpcCall<T>(opts: JsonRpcOptions, method: string, params?: unknown): Promise<T> {
  const { url, timeoutMs = 15000, signal } = opts;
  const id = nextId++;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Timeout")), timeoutMs);
  
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onOuterAbort();
    signal.addEventListener("abort", onOuterAbort);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      const { code, message } = data.error;
      throw Object.assign(new Error(message), { code: code?.toString() || "rpc_error" });
    }

    return data.result as T;
  } catch (err: any) {
    if (err.name === "AbortError" || err.message === "Timeout") {
      const { FiberRpcError } = await import("./types");
      throw new FiberRpcError("timeout", `Request to ${url} timed out after ${timeoutMs}ms`, err);
    }
    const { FiberRpcError } = await import("./types");
    if (err.code && err.code !== "rpc_error") {
      throw new FiberRpcError(err.code, err.message, err);
    }
    throw new FiberRpcError("network", err.message, err);
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onOuterAbort);
    }
  }
}
