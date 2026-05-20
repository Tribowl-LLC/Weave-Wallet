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
- `VITE_FIBER_RPC_URL`: Set to a Fiber node JSON-RPC endpoint to enable real mode. Leave empty to use the simulated mock client.
- `VITE_FIBER_MODE`: Optional "auto" (default), "real", or "mock". "auto" uses real mode if URL is reachable, else falls back to mock.

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

- **Custodial Signing Model**: The Fiber node holds the funded wallet key. The PWA just submits send-payment requests. The Passkey gates the UI instead of deriving CKB keys from WebAuthn.
- **Fiber RPC**: Real RPC method names (`node_info`, `list_channels`, `new_invoice`, `send_payment`, `get_payment`) in `real-client.ts` are best-effort against public Fiber docs. They should be verified against the operator's actual node version.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
