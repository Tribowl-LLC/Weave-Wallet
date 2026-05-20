# WeaveWallet

A non-custodial PWA that lets you scan a Lightning invoice and pay it from your Fiber stablecoin (RUSD / USDI) balance, settled by your own Fiber node.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — run all workspace test suites
- `pnpm --filter @workspace/fiberpay run test` — run the WeaveWallet test suite once (Vitest)
- `pnpm --filter @workspace/fiberpay run test:watch` — re-run tests on change
- `pnpm --filter @workspace/fiberpay run test:coverage` — generate a coverage report (`coverage/index.html`)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

### Testing
- **Vitest + jsdom + @testing-library/react** under `artifacts/fiberpay/src/**/*.test.ts(x)`, colocated with the code under test.
- Setup file `src/test/setup.ts` stubs `navigator.vibrate`, `navigator.onLine`, `HTMLAnchorElement.click`, and clears `localStorage` between tests.
- Coverage focus is **business logic, not UI pixels**: `lightning.ts` (bolt11 decode + USD conversion), `errors.ts` (friendly error mapper, all branches), `exportActivity.ts` (CSV BOM + formula-injection guard + JSON envelope), `fiber/connection.ts` (subscribe/patch), `fiber/conversion.ts`, `fiber/mock-client.ts` (4 lightning-status branches, refund paths, insufficient balance — randomness stubbed for determinism), `fiber/client.ts` (signature-based caching), and `components/OfflineBanner.tsx` as a smoke test for the offline UX.
- `bolt11` is mocked in `lightning.test.ts` so tests don't break when the upstream library tightens checksum validation.

### Fiber Configuration
- The app uses a user-node-first architecture where the user configures the Fiber RPC connection within the Settings screen of the app.
- Configuration (RPC URL, optional Auth Token, and Mode) is persisted via the `useWalletStore`.
- No environment variables are required to configure the Fiber RPC endpoint.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- **User-node-first, non-custodial**: The user runs their own Fiber node and the PWA connects to it directly via RPC.
- **Custodial Signing Model**: The Fiber node holds the funded wallet key. The PWA just submits send-payment requests. The Passkey gates the UI instead of deriving CKB keys from WebAuthn.
- **Fiber RPC**: Real RPC method names (`node_info`, `list_channels`, `new_invoice`, `send_payment`, `get_payment`) in `real-client.ts` are best-effort against public Fiber docs. They should be verified against the operator's actual node version.
- **Cross-network atomicity is a NODE guarantee, not a wallet guarantee.** After Fiber settles, the wallet polls the node for Lightning status via `get_lightning_invoice` / `lookup_invoice` (by `payment_request` or `payment_hash`) and surfaces `settled` / `pending` / `failed` / `unknown` honestly — it never claims success it didn't verify. Refund of a partial failure is the node's responsibility. See `artifacts/fiberpay/docs/lightning-fulfillment.md`.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
