# WeaveWallet

A non-custodial PWA that scans a Lightning invoice and pays it from your
**Fiber stablecoin** (RUSD / USDI) balance, settled atomically by your
own Fiber node.

> **You run the node. We just hold the camera.**

WeaveWallet does not custody funds, derive keys from your passkey, or
proxy payments through a server we control. The passkey gates the UI;
the funded wallet key lives on your Fiber node. Every payment is
submitted to your node over JSON-RPC and reported back honestly — if
the wallet can't verify settlement, it says so instead of guessing.

---

## Quick start

```bash
# 1. Install dependencies (Node.js 24, pnpm 10+)
pnpm install

# 2. Run the WeaveWallet PWA locally
pnpm --filter @workspace/fiberpay run dev

# 3. Run the test suite (66+ tests, Vitest + jsdom)
pnpm --filter @workspace/fiberpay run test

# 4. Typecheck the whole monorepo
pnpm run typecheck
```

The PWA boots in **test mode** by default — simulated balances,
simulated payments, no node required. This is fine for poking around the
UI and the failure flows. To pay a real Lightning invoice you need a
real Fiber node. **Don't skip the next section.**

---

## Ready to test with real funds?

The wallet is only useful when pointed at a real Fiber node paying real
Lightning invoices. We've written a step-by-step checklist for that:

### → [Real-world testing guide](./artifacts/fiberpay/docs/testing-guide.md)

It covers:

1. Running your Fiber node (Docker Compose)
2. Funding it and opening channels
3. Connecting the wallet
4. Scanning a real Lightning QR and completing a payment (Phoenix, LND, Strike, Cash App, **Square terminal**, any bolt11 source)
5. Verifying both legs (Fiber + Lightning) independently
6. Deliberately triggering every failure case so you know what they look like

Companion docs:

- [Fiber node setup](./artifacts/fiberpay/docs/fiber-node-setup.md) — Docker Compose template, config, and a troubleshooting table keyed to every error message the wallet shows.
- [Lightning fulfillment & atomicity](./artifacts/fiberpay/docs/lightning-fulfillment.md) — what the two-leg payment looks like and why atomicity is your node's guarantee, not the wallet's.

Inside the app, tap the **"Ready to test with real funds?"** banner on
Home (visible once you've connected to a real node) for a condensed
in-app version of the checklist.

---

## What WeaveWallet does

- **Scan** a Lightning bolt11 QR with your phone's camera
- **Decode** it locally (no server roundtrip — bolt11 parsing is in-browser)
- **Authenticate** the payment with a passkey (Face ID / Touch ID / Windows Hello)
- **Submit** the payment to your Fiber node, which debits your stablecoin balance and forwards over a cross-network channel
- **Poll** both ledgers and surface an honest status — `settled`, `pending`, `failed`, or `unknown`
- Works offline-friendly (PWA, install to home screen), with explicit offline indicators when network is gone

What it **doesn't** do:

- It does not custody your funds
- It does not derive CKB keys from WebAuthn — the funded key lives on your node
- It does not silently fall back when something is unverified — `unknown` is shown as `unknown`

---

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind + framer-motion + wouter + zustand
- **PWA**: `vite-plugin-pwa` (Workbox)
- **Auth**: `@simplewebauthn/browser` (passkeys, WebAuthn)
- **Lightning decode**: `bolt11` (in-browser)
- **QR scan**: `html5-qrcode`
- **Tests**: Vitest + jsdom + Testing Library
- **Backend** (optional, currently a thin Express scaffold): pnpm workspaces, Node 24, TypeScript 5.9, OpenAPI-generated client

---

## Commands

| Command | What it does |
|---|---|
| `pnpm --filter @workspace/fiberpay run dev` | Start the PWA in dev mode |
| `pnpm --filter @workspace/fiberpay run build` | Production build |
| `pnpm --filter @workspace/fiberpay run test` | Run the test suite once |
| `pnpm --filter @workspace/fiberpay run test:watch` | Re-run tests on change |
| `pnpm --filter @workspace/fiberpay run test:coverage` | Coverage report → `coverage/index.html` |
| `pnpm --filter @workspace/api-server run dev` | Start the API server (optional) |
| `pnpm run typecheck` | Typecheck the whole monorepo |
| `pnpm run build` | Typecheck + build everything |
| `pnpm test` | Run tests across every package |

---

## Repository layout

```
artifacts/
  fiberpay/                 # the WeaveWallet PWA
    src/
      pages/                # Home, Scan, Confirm, Settings, Activity, Help, Onboarding
      components/           # OfflineBanner + UI primitives
      lib/
        lightning.ts        # bolt11 decode + msat → USD
        errors.ts           # central friendly-error mapper
        exportActivity.ts   # CSV (BOM + formula-injection guard) + JSON exports
        fiber/              # client.ts, mock-client.ts, real-client.ts, connection.ts
      store/                # zustand stores (wallet, activity)
    docs/
      fiber-node-setup.md   # Docker Compose + troubleshooting
      testing-guide.md      # Real-world testing checklist
      lightning-fulfillment.md
  api-server/               # optional Express backend
  mockup-sandbox/           # design canvas
lib/                        # shared libs (API client, etc.)
```

---

## Contributing

Before opening a PR, run:

```bash
pnpm run typecheck
pnpm --filter @workspace/fiberpay run test
```

Both must be green. New business logic should land with tests under
`artifacts/fiberpay/src/**/*.test.ts(x)` — the existing suite is a good
template for what coverage looks like (~70-80% on critical logic,
deterministic mocks for `Math.random` and external libs, no UI pixel
matching).

---

## License

See repository.
