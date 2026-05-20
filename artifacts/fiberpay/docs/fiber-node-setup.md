# Running a Fiber Node for WeaveWallet

WeaveWallet is **non-custodial** — every payment is signed and settled by
**your own Fiber node**. The wallet itself just decodes the invoice,
asks your node to pay it, and surfaces the result honestly.

This guide walks through running a Fiber node locally with Docker
Compose, opening enough channels to actually pay an invoice, and
connecting WeaveWallet to it.

> **Status of these instructions.** The Fiber Network protocol is still
> evolving. RPC method names (`node_info`, `list_channels`,
> `send_payment`, `get_payment`, `new_invoice`, `get_lightning_invoice`,
> `lookup_invoice`) match the publicly documented Fiber spec at time of
> writing, but the exact image tag and config keys may drift. **Always
> diff against the upstream Fiber repo's `docker/` and `config/` folders
> for your version.**

---

## 1. Prerequisites

- Docker 24+ and Docker Compose v2 (`docker compose`, not `docker-compose`)
- Open TCP ports: `8227` (JSON-RPC), `8228` (P2P), `8229` (gossip)
- ~5 GB free disk for chain + channel state
- A small amount of CKB testnet or mainnet capacity to open at least one channel
- A Lightning peer to bridge to (any LND/CLN/Eclair node with a Fiber bridge open)

---

## 2. `docker-compose.yml`

Create a working directory and drop this in as `docker-compose.yml`. It
runs a single Fiber node container that exposes the JSON-RPC port the
wallet talks to. For anything beyond localhost you'll want to add a
reverse proxy (Caddy or nginx) in front of port 8227 to terminate TLS —
see [section 7](#7-going-to-production).

```yaml
services:
  fiber:
    image: ghcr.io/nervosnetwork/fnn:latest   # pin a digest in production
    container_name: fiber-node
    restart: unless-stopped
    ports:
      - "8227:8227"   # JSON-RPC (the wallet talks to this)
      - "8228:8228"   # P2P (peer connections)
      - "8229:8229"   # gossip
    volumes:
      - ./data:/root/.fiber          # chain + channel state
      - ./config:/root/.fiber/config # see step 3
    environment:
      - RUST_LOG=info,fnn=debug      # turn down to "warn" once stable
      - FIBER_RPC_LISTEN=0.0.0.0:8227
      - FIBER_NETWORK=testnet        # "mainnet" when you go live
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-X", "POST",
             "-H", "Content-Type: application/json",
             "--data", '{"jsonrpc":"2.0","id":1,"method":"node_info","params":[]}',
             "http://localhost:8227"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Start it:

```bash
mkdir -p data config
docker compose up -d
docker compose logs -f fiber
```

You should see lines like `JSON-RPC listening on 0.0.0.0:8227` and
`Connected to N peers` within a minute or two.

---

## 3. `config/fiber.yaml`

Minimum viable config — drop into `./config/fiber.yaml`:

```yaml
network: testnet

rpc:
  listen: 0.0.0.0:8227
  # Set this to a long random string and use the same value in the
  # wallet Settings screen. Leave blank ONLY for purely local dev.
  auth_token: ""

ckb:
  rpc_url: "https://testnet.ckb.dev/rpc"
  indexer_url: "https://testnet.ckb.dev/indexer"

# Lightning bridge — replace with your bridge peer's pubkey + address.
# Without this, the node cannot settle bolt11 invoices.
lightning_bridges:
  - name: "primary"
    peer_pubkey: "03abc..."
    peer_address: "1.2.3.4:9735"

logging:
  level: info
```

Restart after editing config:

```bash
docker compose restart fiber
```

---

## 4. Fund the node and open channels

A freshly started node has zero capacity and cannot pay anything. You
need to:

### a) Get a CKB deposit address

```bash
docker compose exec fiber fnn-cli wallet new-address
# => ckt1q...   (mainnet: ckb1q...)
```

WeaveWallet's onboarding shows this same address as a QR code when you
run it in **test mode** — useful for demos, but for real payments you
must deposit real CKB.

### b) Deposit CKB

Send testnet CKB to the address above. A faucet (e.g.
`https://faucet.nervos.org/`) will give you ~10,000 CKB on testnet.
Wait for ~24 confirmations (≈4 minutes on testnet) before the funds are
spendable.

### c) Open a channel to your bridge peer

```bash
docker compose exec fiber fnn-cli channel open \
  --peer 03abc...@1.2.3.4:9735 \
  --funding-amount 5000 \
  --asset RUSD
```

Repeat for USDI if you want both assets active. Channels need a few
confirmations to become `active`; check with:

```bash
docker compose exec fiber fnn-cli channel list
```

---

## 5. Connect WeaveWallet to your node

1. Open WeaveWallet → **Settings**.
2. Switch **Mode** to **Real node**.
3. Set **RPC URL** to `http://YOUR_HOST:8227` (or `https://...` behind
   a TLS reverse proxy — strongly recommended for anything beyond
   localhost).
4. Paste the **Auth Token** you set in `fiber.yaml` (or leave blank if
   you didn't).
5. Tap **Test connection**. You should see the node's public key + alias
   come back within a couple of seconds.
6. Tap **Save**. The status dot on Home turns green.

The first time you connect, WeaveWallet calls `node_info` and
`list_channels` to confirm the node is reachable and has at least one
open channel for your selected asset. If either check fails, Settings
shows the exact reason rather than guessing.

---

## 6. Troubleshooting

### `Cannot reach your Fiber node` / status dot red
- Is the container running? `docker compose ps` — look for `Up (healthy)`.
- Is port 8227 actually reachable? `curl -s http://localhost:8227 -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","id":1,"method":"node_info","params":[]}'` should return JSON.
- If the wallet is on a phone and the node is on your laptop, your phone needs to reach your laptop's LAN IP. `localhost` from a phone is the phone itself, not your laptop.
- If you're going over HTTPS via a reverse proxy, make sure the proxy forwards `Content-Type` and doesn't strip the JSON body.

### `Your node rejected the auth token`
- The token in Settings doesn't match `rpc.auth_token` in `fiber.yaml`.
- Restart the node after editing the config — Fiber reads it at startup, not on the fly.
- If you didn't set a token in config, leave the wallet field blank too. A blank token sends no `Authorization` header.

### `Your node took too long to respond` (timeout)
- The node is up but starved for CKB peers — check `docker compose logs fiber | grep peer`.
- The first `node_info` call after a cold start can take 10–15s while indexing catches up. Tap **Test connection** again after a minute.

### `Your node doesn't support this action` (`-32601 method_not_found`)
- You're on a Fiber build that predates one of the methods the wallet calls (`get_lightning_invoice`, `lookup_invoice`, `list_channels`).
- Upgrade to a recent build: `docker compose pull fiber && docker compose up -d`.

### `Not enough balance for this payment`
- The asset you're paying with doesn't have enough capacity in *any single channel*. Open a larger channel, rebalance, or split the payment across channels (the node decides — the wallet just submits).

### `Your node couldn't find a route` (`no_route`)
- The bridge peer doesn't have inbound Lightning liquidity to settle the bolt11 invoice. Add a second bridge or wait for liquidity to rebalance.
- The invoice is on a network your bridge can't reach (e.g. paying a mainnet invoice from a testnet node).

### `Lightning leg unverified` (pending/unknown after payment)
- The Fiber side settled but your node hasn't gotten a final answer from the bridge yet. Tap **Re-check** in the activity drawer; most of these resolve within a minute.
- If it stays unknown for >10 minutes, check your node's logs for HTLC failures — the Fiber leg may need to be refunded manually depending on your node version.

---

## 7. Going to production

Before pointing a real wallet at a real node:

1. **Run behind HTTPS.** Caddy or nginx with Let's Encrypt is two lines of config and prevents auth tokens from leaking on Wi-Fi.
2. **Set a strong `rpc.auth_token`.** 32+ random bytes, hex- or base64-encoded.
3. **Restrict ingress.** Only expose port 8227 to the wallet's source IP (or to localhost behind a tunnel). The P2P port (8228) needs to be open to the internet; the RPC port does not.
4. **Back up `./data/`.** Channel state is non-recoverable from chain alone.
5. **Pin the image digest** in `docker-compose.yml` so a malicious upstream `latest` push can't compromise your node.
6. **Monitor the healthcheck.** A failed healthcheck for >5 minutes means payments will fail; wire it into your alerting.

When you're ready to actually pay an invoice end-to-end, follow the
[testing guide](./testing-guide.md) for a step-by-step real-world
checklist.
