# Nervos Community Announcement — WeaveWallet v1.0

Three formats, copy-paste-ready. Pick the one that matches the venue.
Swap `https://github.com/your-org/weavewallet` for the real repo URL
before posting.

---

## Long form (Nervos Talk / Reddit / blog post)

> **WeaveWallet v1.0 — pay any Lightning invoice with Fiber stablecoins, from your own node**

Hi Nervos community,

We're excited to share **WeaveWallet v1.0**, a non-custodial PWA that
turns any Fiber node into a stablecoin-powered Lightning wallet you can
carry in your pocket.

**The flow, in one sentence:** scan a Lightning bolt11 QR with your
phone, confirm with a passkey, and the payment settles from your
RUSD / USDI balance on Fiber — your own node bridges to Lightning.

**Why we built it.** Fiber unlocks something quietly remarkable: real
stablecoin liquidity that can hop onto the Lightning network. But most
of the surface area is still CLI-shaped, and "open Lightning to anyone
holding a stablecoin" is too good a UX story to leave on the command
line. WeaveWallet is our attempt to put that capability behind a single
green "Scan to Pay" button without compromising on the part that
matters most: **you run the node, not us**.

**What v1.0 includes:**

- Scan-and-pay for any bolt11 Lightning invoice (Phoenix, LND, CLN, Strike, Cash App, Square terminals — anything that emits a real bolt11)
- Pay with **RUSD or USDI**, live USD-equivalent display, per-asset balance toggling
- **Passkey-gated UI** (Face ID / Touch ID / Windows Hello) — biometrics confirm intent; the funded key lives on your node, never derived from WebAuthn
- **Honest settlement reporting** — Fiber and Lightning legs are tracked independently and surfaced as Settled / Pending confirmation / Failed / Unverified. The wallet never claims success it hasn't verified.
- **Installable PWA** with offline indicators, service-worker caching, and a real Add-to-Home-Screen flow on iOS Safari and Android Chrome
- **Activity export** (CSV with UTF-8 BOM + formula-injection guard, JSON envelope) for accounting and audit
- **Zero telemetry**, zero phone-home, zero central server. Your node is the only backend.
- **67 Vitest tests** across the business logic, with the OfflineBanner UX as a smoke test
- **Full deployment guide** — from a fresh VPS to a paid Square Sandbox transaction in copy-paste commands

**What v1.0 deliberately doesn't include:**

- A bundled node. WeaveWallet is non-custodial — you run the node yourself, full stop.
- Mainnet validation. The end-to-end docs are verified on Fiber testnet + Square Sandbox. Re-run the whole guide before pointing real money at it.
- LNURL-pay resolution. v1.0 accepts raw bolt11 only; LNURL is on the v1.1 shortlist.
- Receiving payments into the node from the wallet UI. Channel and inbound ops live in the node CLI for now.
- Custody, key derivation from WebAuthn, or silent fallback when settlement is unverified. These are not bugs — they're load-bearing design choices.

**How to get started.** The repo has a single entry point that takes
you from "I have a fresh VPS" to "I just paid a real Square Lightning
QR with stablecoin from my own Fiber node":

→ **[Deployment & testing guide](https://github.com/your-org/weavewallet/blob/main/artifacts/fiberpay/docs/deployment-and-testing.md)**

If you just want to kick the tires without a node, `pnpm install` and
`pnpm --filter @workspace/fiberpay run dev` boots the wallet in
simulated test mode in about 30 seconds.

**We need pilot testers.** Specifically:

- **Node operators** willing to run the wallet against your own Fiber build and tell us where the RPC shape drifts from what we expect
- **Merchants** with a Square Sandbox, a BTCPay register, or any bolt11-capable POS — we want to hear what the scan → pay → confirm flow feels like at real point-of-sale tempo
- **Bridge operators** with capacity to test fail-and-refund paths under realistic load
- **Designers / accessibility reviewers** — the UI is dark-mode-only and hasn't been audited for screen readers; we'd love patches

Every pilot report shapes v1.1. File issues with the `pilot-feedback`
label, or share what you learned publicly with `#WeaveWallet` so other
operators can find it.

Repo: https://github.com/your-org/weavewallet
Release notes: [`v1.0-release-notes.md`](https://github.com/your-org/weavewallet/blob/main/artifacts/fiberpay/docs/v1.0-release-notes.md)
Getting started: [`deployment-and-testing.md`](https://github.com/your-org/weavewallet/blob/main/artifacts/fiberpay/docs/deployment-and-testing.md)

Thanks to everyone in this community who answered our questions on
Fiber RPC shapes, bridge behavior, and channel quirks while we were
building this. WeaveWallet exists because you were generous. Looking
forward to your feedback.

— the WeaveWallet team

---

## Medium form (Discord / Telegram / Matrix)

> **WeaveWallet v1.0 is live** — a non-custodial PWA that lets you scan any Lightning invoice and pay it from your Fiber stablecoin (RUSD / USDI) balance, settled by **your own** node.
>
> **What it does:** scan bolt11 → passkey confirm → pay in stablecoin → both Fiber and Lightning legs verified independently. Works against any bolt11 source — Phoenix, LND, Strike, Square terminals, BTCPay registers.
>
> **What it doesn't:** custody your funds, bundle a node, derive keys from WebAuthn, or claim success it hasn't verified. You run the node, we just hold the camera.
>
> **Try it:**
> – Just the UI (no node): `pnpm install && pnpm --filter @workspace/fiberpay run dev`
> – Full end-to-end with a real Square Sandbox payment: the guide takes you from a fresh VPS to a paid transaction with copy-paste commands → `artifacts/fiberpay/docs/deployment-and-testing.md`
>
> **We need pilots.** Node operators, merchants with bolt11 POS setups, bridge operators, and designers/a11y reviewers especially. File issues with `pilot-feedback`, or DM us. Every report shapes v1.1.
>
> Repo: https://github.com/your-org/weavewallet
> Release notes: `artifacts/fiberpay/docs/v1.0-release-notes.md`
>
> Huge thanks to the Nervos + Fiber communities for the patient RPC-shape conversations that made this possible. 🟢

---

## Short form (X / Twitter / Mastodon)

> Shipping **WeaveWallet v1.0** 🟢
>
> Non-custodial PWA. Scan any Lightning invoice, pay it with Fiber stablecoins (RUSD/USDI), settled by **your own** node. Passkey-gated. Honest settlement reporting. Zero telemetry.
>
> Works with Phoenix, LND, Strike, Square terminals — anything bolt11.
>
> Pilot testers wanted, especially node operators + merchants with bolt11 POS. Repo + full Square Sandbox deploy guide → https://github.com/your-org/weavewallet
>
> #Nervos #Fiber #Lightning

---

### Posting checklist

Before hitting publish in any channel:

- [ ] Replaced `your-org/weavewallet` with the real GitHub URL
- [ ] Verified all three doc links resolve from a logged-out browser
- [ ] Confirmed the repo is public (or invite links are ready if it's a private pilot)
- [ ] Tagged a maintainer to triage `pilot-feedback` issues for the first 48 hours
- [ ] Pinned the post in the relevant channel for at least a week
