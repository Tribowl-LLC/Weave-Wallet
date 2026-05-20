# Lightning Fulfillment & Atomicity

WeaveWallet pays a **Lightning** invoice from a **Fiber** stablecoin balance.
That requires two settlements: one on Fiber, one on Lightning. The PWA
itself can't guarantee atomicity — that guarantee lives on **your Fiber
node**.

This doc describes what the node needs to expose, and how the wallet
behaves when it doesn't.

## The two-leg payment

1. Wallet calls `send_payment` on your node with:
   - `lightning_invoice` — the original bolt11 string, threaded as a hint to the bridge
   - `invoice` / `amount` / `currency` — Fiber-side fields describing the asset and amount to debit
2. The node debits the user's Fiber balance and forwards over a
   cross-network channel.
3. The wallet polls `get_payment` until the Fiber leg reaches `Success`
   or `Failed`.
4. On Fiber success, the wallet polls a Lightning-side method to confirm
   the bridged invoice actually settled.

## What "atomic" means here

True atomicity requires **one of**:

1. **HTLC equivalence** — a Fiber↔Lightning channel where the same
   `payment_hash` settles both legs. The preimage that unlocks the Fiber
   HTLC is the same preimage the Lightning invoice was generated with,
   so the bridge can't pocket the Fiber side without revealing the
   preimage (which then also settles Lightning).
2. **Submarine swap with timelock refund** — the node bridges
   asynchronously and, if the Lightning leg fails before the timelock
   expires, refunds the Fiber side automatically.
3. **Trusted bridge** — the node operator is trusted; partial failures
   are reconciled manually. Not recommended.

WeaveWallet assumes (1) or (2). The node is responsible for the refund
path; the wallet just surfaces whatever status the node reports.

## RPCs the wallet expects

Each poll round the wallet tries all of the probes below in order until
one returns a **terminal** status (`settled` / `failed`). Non-terminal
responses (`pending` / `open` / `accepted`) keep the loop running until
the 12 s timeout. Probes that return JSON-RPC `-32601` (method-not-found)
are treated as capability misses and skipped on subsequent rounds-worth
of decisions. All of these RPCs are optional — missing every one of them
only degrades the Lightning-side status to `unknown`, it doesn't break
payments.

### Required for the Fiber leg

| Method          | Used for                                |
| --------------- | --------------------------------------- |
| `node_info`     | Health check, network detection         |
| `send_payment`  | Submit the cross-network payment        |
| `get_payment`   | Poll Fiber-side status                  |
| `list_channels` | Onboarding / channel health             |
| `get_balances`  | Show available balance per asset        |

### Required for Lightning status verification (any one)

The wallet calls these in order, treating JSON-RPC `-32601`
(method-not-found) as "this build doesn't expose it, try the next":

| Method                   | Params                              |
| ------------------------ | ----------------------------------- |
| `get_lightning_invoice`  | `{ invoice: <bolt11 string> }`      |
| `lookup_invoice`         | `{ payment_request: <bolt11> }`     |
| `lookup_invoice`         | `{ payment_hash: <hex hash> }`      |

Expected response shape (loose — the wallet reads `status` then `state`):

```json
{ "status": "settled" | "paid" | "succeeded"   // → settled
        | "pending" | "open" | "accepted"      // → keep polling
        | "failed" | "canceled" | "cancelled", // → failed
  "error_message": "..."                       // optional
}
```

### Optional (used by onboarding)

| Method                 | Notes                                          |
| ---------------------- | ---------------------------------------------- |
| `get_deposit_address`  | First probe for the Fund step's QR             |
| `wallet_address`       | Fallback                                       |
| `get_receive_address`  | Fallback                                       |

## Status the wallet reports

After Fiber settles, the wallet shows one of four Lightning statuses:

| Status     | When                                                                            | UI                                  |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `settled`  | A probe returned `settled` / `paid` / `succeeded` within 12 s                   | Green "Payment sent successfully"   |
| `pending`  | A probe was reachable but returned a non-terminal state until the 12 s timeout  | Amber "Lightning settlement pending"|
| `failed`   | A probe returned `failed` / `canceled`                                          | Amber "Lightning settlement failed" |
| `unknown`  | No probe ever returned successfully (every method was 404 or transport-failed)  | Neutral "Lightning status unverified"|

`pending`, `failed`, and `unknown` all expose a **Re-check Lightning
status** button that re-runs the same probes with an 8 s timeout.

## What the wallet does NOT claim

- The wallet **does not implement** the refund path for partial
  failures. If your node's bridge fails after debiting the Fiber side,
  the node must refund automatically. The wallet shows the failed state
  so you can reconcile, but it cannot reverse the Fiber transaction.
- The wallet does **not** sign Lightning HTLCs itself. Custody of both
  the Fiber and Lightning keys lives on the node.
- `unknown` is honest: it means we genuinely couldn't verify. Do not
  treat it as a soft success. Check your node's logs or `lookup_invoice`
  CLI to confirm.

## Test mode

The mock client simulates realistic outcomes:

- 85% `settled`
- 10% `pending`
- 5% `failed`

This lets you exercise the partial-state UI without running a real node.
