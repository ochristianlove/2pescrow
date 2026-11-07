# 2Pescrow

Buyer-funded P2P escrow for **Ethereum (ERC-20 USDT)** and **Tron (TRC-20 USDT)**, with off-chain proof storage, on-chain settlement, disputes, and a dark-mode web dashboard.

## Wallet role tags

Configure these in `.env` (see `.env.example`):

| Tag | Purpose |
|-----|---------|
| `FEE_RECIPIENT_WALLET` | Receives **$1 creation fee**, **10%** on buyer approve, **10%** on buyer-favor dispute |
| `DEPLOYER_WALLET` | Owns factory admin; default **resolver** in admin mode |
| `BUYER_WALLET` | Funds escrow (reference / testing) |
| `SELLER_WALLET` | Submits delivery proof hash |
| `AGENT_WALLET` | Optional resolver when agent mode is enabled |
| `USDT_ADDRESS` | Official Ethereum ERC-20 USDT |

## Monorepo layout

```
contracts/          Solidity EscrowFactory + EscrowDeal (Ethereum EVM)
apps/api/           Node.js + TypeScript REST + WebSocket + uploads
apps/indexer/       Ethereum event watcher → API ingest
apps/web/           Vite React UI (WalletConnect, MetaMask, Rabby)
packages/shared/    ABIs, chain constants, role tags
docker/             Dockerfiles
```

## Escrow state machine (on-chain)

`Created → Funded → InProgress → Completed | Cancelled | Disputed → Resolved`

- **Buyer** deposits `escrowAmount + $1` creation fee (`fund`)
- **Seller** `submitProof(bytes32)` after off-chain file upload
- **Buyer** `approveRelease()` → **90%** `SELLER_WALLET`, **10%** `FEE_RECIPIENT_WALLET`
- **Both** `requestCancel()` → **100%** back to `BUYER_WALLET` (escrow principal)
- **Dispute** → resolver `resolveDispute(true)` **90% buyer / 10% fee** or `false` **100% seller**

## Quick start (local)

```bash
cp .env.example .env
# Edit wallet tags and token addresses

npm install
npm run compile -w @2pescrow/contracts
npm run test:contracts

docker compose up --build
```

- API: http://localhost:3002/health  
- Web app: http://localhost:3003  
- User dashboard (Zenland-style): http://localhost:3003/app  
- Sign in (magic link, buyers/sellers): http://localhost:3003/signin  
- Referral program: http://localhost:3003/referrals · invite links `/r/{code}`  
- Admin login (hidden): http://localhost:3003/sys/login  
- Postgres: `localhost:5433`  

## Networks

Ethereum mainnet uses official ERC-20 USDT (`0xdAC17F958D2ee523a2206206994597C13D831ec7`). Tron uses TRC-20 USDT. Set `ESCROW_FACTORY_ADDRESS` after deploying the V2 factory on Ethereum.

## Admin API

`PUT /v1/admin/settings` with header `x-admin-key: $ADMIN_API_KEY` to update `FEE_RECIPIENT_WALLET`, token addresses, `resolution_mode` (`admin` | `agent`), and factory address.

Required secrets (no defaults): `JWT_SECRET`, `ADMIN_API_KEY`, `INDEXER_API_KEY` (must differ from admin key), `ADMIN_PASSWORD`. Indexers call `/v1/indexer/ingest` with header `x-indexer-key: $INDEXER_API_KEY`. Magic-link sign-in requires SMTP — configure under **Admin → Email delivery (SMTP)** (or optional `SMTP_*` env vars for bootstrap).

## Mobile apps

Native shells live in **`apps/mobile`** (Expo, iOS + Android). They load the same web app against your public origin. App Store / Google Play URLs can be saved under **Admin → Site & SEO** for when download links are added to the site.

Build and publish steps: [`apps/mobile/README.md`](apps/mobile/README.md). Deeper native features (push, standalone RN screens) are outlined in `PROJECT_PLAN.md` §8.

## License

MIT
