# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
