# WeaveWallet Real-World Testing Guide

This is the checklist to follow when taking WeaveWallet off the
simulator and pointing it at a real Fiber node + a real Lightning
invoice. Work through it top-to-bottom the first time; once you're
confident, you only need the **happy path** and the **failure modes**
sections.

If anything fails, the [Fiber node setup guide](./fiber-node-setup.md)
has a troubleshooting section keyed to the exact error messages the
wallet shows.

---

## 0. Before you start

You need:

- A Fiber node you control — see [fiber-node-setup.md](./fiber-node-setup.md)
- At least **one open Fiber channel** with non-zero capacity in the asset you want to spend (RUSD or USDI)
- At least **one Lightning bridge** configured on your node with enough inbound LN liquidity to settle the invoices you'll test against
- A second device (or browser tab) that can **generate Lightning invoices** — e.g. a Phoenix wallet, an LND admin UI, a Strike/Cash App account, or a real merchant terminal like a Square or BTCPay register
- WeaveWallet installed on the device you'll pay from (Add to Home Screen on iOS, Install prompt on Android)

> **Test on testnet first.** Both Fiber and Lightning have testnet
> equivalents. Run through this entire guide end-to-end on testnet
> before sending a single real cent.

---

## 1. Run your Fiber node

```bash
docker compose up -d
docker compose ps        # expect: Up (healthy)
docker compose logs -f fiber | grep -i "rpc listening\|connected to"
```

You should see `JSON-RPC listening on 0.0.0.0:8227` and at least a few
`Connected to peer` lines within 30s.

**Done when**: `docker compose ps` shows `Up (healthy)`.

---

## 2. Fund the node and open channels

```bash
# Get an address
docker compose exec fiber fnn-cli wallet new-address
# Deposit CKB to it from a faucet (testnet) or exchange (mainnet)
# Wait ~24 confirmations

# Verify funds landed
docker compose exec fiber fnn-cli wallet balance

# Open at least one channel per asset you'll test
docker compose exec fiber fnn-cli channel open \
  --peer 03abc...@1.2.3.4:9735 \
  --funding-amount 5000 \
  --asset RUSD

docker compose exec fiber fnn-cli channel list
```

**Done when**: at least one channel shows `state: active` with
`local_balance > 0` for the asset you want to spend.

---

## 3. Connect the wallet

1. Open WeaveWallet on your phone.
2. **Settings → Mode** → **Real node**.
3. **RPC URL**: `http://YOUR_LAN_IP:8227` (or `https://...` if you set up TLS).
4. **Auth token**: paste the same string you put in `fiber.yaml` (or leave blank).
5. Tap **Test connection**.
   - Expect: green check, node alias + pubkey appear within ~3s.
   - If red: open the [troubleshooting section](./fiber-node-setup.md#6-troubleshooting).
6. Tap **Save**.
7. Return to Home — the status dot next to "WeaveWallet" should be **green**.
8. Pull-to-refresh (or wait): balance card should show your actual
   channel capacity (RUSD and/or USDI), not the test-mode seed values.

**Done when**: status dot is green AND the balance card reflects your real channel capacities.

---

## 4. The happy path: pay a real Lightning invoice

1. On your second device, generate a small Lightning invoice. **Start with $0.50–$2.00** for your first real test.
   - Phoenix / Muun: tap Receive → enter amount → Bolt11
   - LND admin: `lncli addinvoice --amt_msat 500000 --memo "weavewallet test"`
   - Strike / Cash App: tap Request → Lightning
   - Square terminal: print or display the Lightning QR for a real order
2. In WeaveWallet, tap **Scan to Pay**.
3. Allow camera access on the first run.
4. Frame the QR.
   - Expect: a short haptic, the camera closes, the Confirm screen appears within a second.
   - The amount, memo (if any), and recipient hash should match the invoice you generated.
5. The asset chip at the top of Confirm should reflect your current
   selected asset (RUSD or USDI). If you have both, you can switch.
6. Tap **Pay** and authenticate with your passkey (Face ID / Touch ID / Windows Hello).
7. Watch the status panel cycle through:
   - **Creating Fiber invoice…**
   - **Sending payment on Fiber…**
   - **Fulfilling Lightning invoice…**
   - **Confirming Lightning settlement…**
8. You should land on the **Success** screen within 3–8 seconds.

**Done when**: WeaveWallet shows "Fiber payment sent" AND the receiving
wallet shows the incoming Lightning payment marked as **settled / received**.

---

## 5. Verify both legs independently

This is the critical step. The wallet *tells* you what it thinks
happened, but you should confirm both ledgers directly the first few
times.

### a) Fiber leg

```bash
docker compose exec fiber fnn-cli payment list --limit 1
```

Expect:

- `status: success`
- `amount` and `asset` match what you sent
- `fiber_tx_hash` matches the value shown on the WeaveWallet success screen

### b) Lightning leg

On the **receiving** wallet:

- Phoenix / Muun: the incoming payment row shows the amount and a green checkmark
- LND: `lncli lookupinvoice <payment_hash>` → `state: SETTLED`
- Strike / Cash App: the deposit appears in the recent activity feed
- Square: the order is marked paid in the merchant dashboard

The `payment_hash` you see in the receiving wallet must match the one
WeaveWallet shows in the activity detail drawer. If they match and both
sides say "settled", the payment is genuinely atomic.

**Done when**: both legs confirm independently AND the hashes match.

---

## 6. Failure cases to test

Run through these *deliberately* — knowing how the wallet behaves when
things go wrong is more important than knowing it works when they don't.

### a) Low Fiber channel liquidity

1. Note your current channel's `local_balance`.
2. Generate an invoice for slightly **more** than that balance.
3. Scan and attempt to pay.
4. Expect: the Confirm screen accepts the scan, you authenticate, then
   the status panel ends with **"Not enough balance for this payment"**
   (or a similar `no_route` message). The activity entry is marked
   `failed`. No balance change.

### b) Node offline mid-payment

1. Open a new payment but **don't** tap Pay yet.
2. In another terminal, `docker compose stop fiber`.
3. Tap Pay.
4. Expect: the status panel shows **"Can't reach your Fiber node…"** within ~5s. The activity entry is marked `failed`. No partial state.
5. `docker compose start fiber` and verify the next payment works normally.

### c) Lightning bridge has no inbound liquidity

1. Drain or temporarily disconnect your bridge peer's Lightning side.
2. Try to pay an invoice that requires a Lightning hop your bridge can't make.
3. Expect: **"Your node couldn't find a route…"**. Activity marked `failed`. Balance unchanged.

### d) Pending Lightning leg

1. Find a bridge route that's slow (or temporarily congested).
2. Pay an invoice. The Fiber leg settles fast; the Lightning leg may not return immediately.
3. Expect: success screen with a yellow **"Lightning leg pending"** strip.
4. Open Activity → tap the entry → tap **Re-check**. It should resolve to `settled` (most cases) or surface a clear error.

### e) Passkey cancelled

1. Start a payment, get to the biometric prompt, then **cancel** it.
2. Expect: **"Biometric prompt was cancelled."** Toast. Returned to Confirm screen. No payment attempted.

### f) Offline phone

1. Turn on airplane mode.
2. Try to scan and pay.
3. Expect: the orange **"You're offline"** banner appears at the top. Pay attempts are blocked with **"You're offline. Reconnect to the internet and try again."**

### g) Malformed / non-Lightning QR

1. Scan a bitcoin: URI or any other QR.
2. Expect: **"That doesn't look like a valid Lightning invoice."** No charge, no Confirm screen.

### h) Expired invoice

1. Generate a 60-second-expiry invoice. Wait 70s.
2. Scan and pay.
3. Expect: clear error from the node, surfaced as a friendly message. No partial state.

---

## 7. Try a real merchant

Once the failure cases all behave as documented, try the wallet against
a real merchant. Recommended first test: **a $1–$5 purchase** at a
low-stakes merchant. Document anything unexpected.

**WeaveWallet expects a raw bolt11 invoice QR.** The following sources
produce one and work without extra steps:

- Square Lightning terminals
- BTCPay registers
- Strike in-store
- Any LND / CLN / Eclair admin UI that prints an "invoice" QR

**LNURL-pay is not the same thing** as a bolt11 invoice. An LNURL-pay
QR encodes an HTTPS URL the wallet would have to fetch, negotiate an
amount with, and exchange for a bolt11 invoice. WeaveWallet's scanner
currently rejects LNURL payloads with "That doesn't look like a valid
Lightning invoice." If a merchant only exposes LNURL, ask them for a
fixed-amount bolt11 invoice instead, or use an intermediary wallet that
can resolve LNURL → bolt11 before you scan.

---

## 8. What "ready for production" looks like

You can ship the wallet to non-technical users when **all of the
following** are true:

- [ ] At least 20 consecutive happy-path payments without a manual recheck needed
- [ ] All eight failure cases in section 6 produce the documented friendly errors
- [ ] No payment has ever ended in `unknown` Lightning state for >10 minutes
- [ ] No balance has ever been debited without either a `settled` or a documented refund
- [ ] The node has been running with no restart for >7 days
- [ ] You've successfully paid a real merchant (section 7) at least three times

If any box is unchecked, keep testing. The whole point of the user-node
architecture is that *you* are the security boundary — there is no
custodian to clean up after a bad release.
