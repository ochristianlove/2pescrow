# 2Pescrow — Project Plan

**Version:** 2.0 (implemented MVP)  
**Date:** October 19, 2026  
**Author:** Engineering plan for Christian  
**Chain:** [Scroll](https://scroll.io/) (EVM L2, Chain ID `534352`)

---

## Implementation status (built in repo)

This workspace now contains a **runnable MVP** aligned with the approved buyer-funded design (supersedes the earlier dual-deposit draft in sections below where they differ).

| Component | Path | Notes |
|-----------|------|--------|
| Smart contracts | `contracts/contracts/` | `EscrowFactory` + `EscrowDeal` clones; states `Created→Funded→InProgress→Completed/Cancelled/Disputed→Resolved` |
| API | `apps/api/` | Fastify REST, WebSocket `/v1/ws`, proof + dispute uploads, admin settings |
| Indexer | `apps/indexer/` | Watches factory + deal events on Scroll, ingests via `/v1/indexer/ingest` |
| Web | `apps/web/` | Dark UI, WalletConnect + MetaMask/Rabby, dashboard, resolver panel |
| Docker | `docker-compose.yml` | `postgres`, `redis`, `api`, `indexer`, `web` |

**Funding model (implemented):** **BUYER_WALLET** only deposits ERC-20 (USDC, USDT, `THIRD_STABLECOIN_ADDRESS` on Scroll). **$1** flat creation fee to **FEE_RECIPIENT_WALLET**. Approve path: **90% SELLER_WALLET / 10% FEE_RECIPIENT_WALLET**. Mutual cancel: **100%** principal to **BUYER_WALLET**. Dispute: **90% buyer / 10% fee** or **100% seller**.

**Role-tagged env vars:** `FEE_RECIPIENT_WALLET`, `DEPLOYER_WALLET`, `BUYER_WALLET`, `SELLER_WALLET`, `AGENT_WALLET`, `THIRD_STABLECOIN_ADDRESS` — see `.env.example` and `README.md`.

**Still planned:** native Android/iOS apps (React Native) consuming the same `/v1` API; gas relayer; external audit before mainnet funds.

---

## Table of contents

1. [Overview](#1-overview)
2. [Research: reference platforms & patterns](#2-research-reference-platforms--patterns)
3. [Architecture (text diagram)](#3-architecture-text-diagram)
4. [Escrow smart contract design (Scroll)](#4-escrow-smart-contract-design-scroll)
5. [Backend structure (Node.js / TypeScript)](#5-backend-structure-nodejs--typescript)
6. [PostgreSQL database schema](#6-postgresql-database-schema)
7. [Docker setup](#7-docker-setup)
8. [Client apps: Android, iOS, and web (one API)](#8-client-apps-android-ios-and-web-one-api)
9. [Deposit → verify → release flow (two parties)](#9-deposit--verify--release-flow-two-parties)
10. [Phased build order (MVP first)](#10-phased-build-order-mvp-first)
11. [Crypto concepts (plain language)](#11-crypto-concepts-plain-language)
12. [What Christian sets up vs what engineering builds](#12-what-christian-sets-up-vs-what-engineering-builds)
13. [Risks, compliance, and open decisions](#13-risks-compliance-and-open-decisions)

---

## 1. Overview

### What 2Pescrow is

**2Pescrow** is a peer-to-peer crypto escrow on **Scroll**. Two people agree on a deal; **each party deposits crypto** into the same on-chain escrow. Both can **see balances and status** in the web app and mobile apps. The **ledger of who deposited what, and when funds move, lives on-chain** — not on a private spreadsheet.

Think of it like a transparent lockbox on Scroll: money goes in from both sides, everyone can verify the lockbox on a public explorer, and the lockbox only opens when the rules you agreed to are satisfied (or when you both agree to cancel).

### Product surfaces (your requirements)

| Surface | Purpose |
|--------|---------|
| **Web app** | Create/join escrows, connect wallet, deposit, verify counterparty deposits, release or dispute |
| **Android app** | Same flows as web, tuned for mobile wallets |
| **iOS app** | Same flows as web, tuned for mobile wallets |
| **Backend (API)** | User accounts (optional email/login), escrow metadata, notifications, blockchain indexer, links to on-chain state |
| **PostgreSQL** | Off-chain data: profiles, escrow titles, chat notes, indexed events (mirrors chain — chain remains source of truth for funds) |
| **Docker** | Every service runs in containers for consistent dev and deployment |

### Backend language choice

You asked for **Node.js** and said to pick something better if it fits.

**Decision: Node.js with TypeScript** for the backend.

| Reason | Explanation |
|--------|-------------|
| **Web3 libraries** | `viem` / `ethers` are mature in TypeScript; same tooling the web app uses |
| **One language across stack** | Web (React/Next.js), optional React Native for mobile, and API share types and validation (e.g. Zod) |
| **Real-time updates** | WebSockets/SSE for “counterparty just deposited” are straightforward |
| **Job queues** | Indexing Scroll blocks and sending push notifications fit well (BullMQ + Redis) |
| **Your ask** | Matches your Node.js preference without sacrificing ecosystem fit |

Alternatives considered: **Go** (great for indexing, but splits the team across languages); **Rust** (overkill for MVP). TypeScript Node is the pragmatic default for this product.

### Important note about Scroll testnets (2026)

Scroll **Sepolia testnet was shut down after July 30, 2026**. For development we will use:

- **Local:** Hardhat / Anvil + Scroll-compatible EVM settings, **or**
- **Scroll mainnet** with **very small amounts** on a dedicated test wallet (after contracts are reviewed)

The plan assumes **Scroll mainnet** (`https://rpc.scroll.io/`, Chain ID `534352`, explorer [scrollscan.com](https://scrollscan.com/)) for staging/production, and a **local chain** for day-to-day coding.

---

## 2. Research: reference platforms & patterns

### 2.1 “zen.lend” — likely **Zenland** (`zen.land`)

The domain **`zen.lend` does not resolve** (no public site found). The closest match to what you described — **deposit crypto, both parties see status, on-chain ledger** — is almost certainly **[Zenland](https://zen.land/)** (`zen.land`, app at [app.zen.land](https://app.zen.land/)).

| Item | Detail |
|------|--------|
| **What it is** | Non-custodial **P2P escrow** using smart contracts (not a bank holding funds) |
| **Networks** | Ethereum mainnet and Sepolia (not Scroll) |
| **Tokens** | USDC, USDT |
| **Fee** | ~1% protocol fee (min $0.50, max $50) |
| **Docs** | [docs.zen.land](https://docs.zen.land/) — [How it works](https://docs.zen.land/getting-started/how-it-works) |

**How Zenland works (high level):**

1. Buyer creates escrow off agreed terms; terms hashed on-chain; optional dispute **agent**.
2. **Buyer funds** the escrow (buyer deposit only — not dual deposit).
3. Seller **accepts** → state becomes `ACTIVE`.
4. Seller marks **fulfilled**; buyer **releases** or disputes; timeouts can auto-release to seller after protection period.
5. Both parties track status in the **web UI**; anyone can verify balances on **Etherscan**.

**Dual visibility / verification:**

- Each party connects a **wallet**; the app reads **contract state** (amount, status, parties).
- **Deterministic escrow address** known before funding; PDF/terms hash for verification.
- Settlement paths: release, seller refund, mutual split, agent dispute resolution.

**Status (2026):** Zenland announced a transition toward **v2 / DAO** ([token.zen.land](https://token.zen.land/)); app may remain online with limited support. Useful as a **UX and lifecycle reference**, not as Scroll deployment.

**Mapping to 2Pescrow:**

| Zenland | 2Pescrow (your vision) |
|---------|-------------------------|
| Buyer deposits payment | **Both parties deposit** (collateral + payment or symmetric stakes) |
| Ethereum | **Scroll** (lower fees, EVM-compatible) |
| Optional agent disputes | MVP: **mutual approve** + timeouts; later: optional arbitrator |
| Wallet-only identity | Wallet + optional **email account** for notifications |

---

### 2.2 Other relevant examples

#### On Scroll (or built for Scroll)

| Name | URL | Pattern | Dual visibility |
|------|-----|---------|-----------------|
| **ConfiaPago** | [GitHub: ConfiaPago-Scroll-57](https://github.com/HackBalam/ConfiaPago-Scroll-57) | P2P marketplace escrow on Scroll; buyer deposits; proof + buyer confirms release | Wallet login; on-chain escrow; UI tracks deal state |
| **Buddy** | [ETHGlobal showcase](https://ethglobal.com/showcase/buddy-fo8cv) | P2P fiat↔crypto with escrow contracts; deployed on **Scroll Sepolia** (historical) | Both traders see order/escrow via dApp |
| **Escrow Board** | [app.escrowboard.xyz](https://app.escrowboard.xyz/) | Escrow dApp with Scroll Sepolia contracts ([repo](https://github.com/Escrow-Board/escrow-board)) | Connect wallet; view escrow on explorer |
| **Rho Markets** | [Scroll blog](https://scroll.ghost.io/rho-markets-x-scroll/) | **Lending**, not P2P escrow | N/A — liquidity protocol, not two-party lockbox |

#### Similar L2 / EVM (pattern reference, not Scroll)

| Name | URL | Notes |
|------|-----|-------|
| **OpenPeer Escrow** | [OpenPeerEscrow.sol](https://github.com/Minke-Labs/openpeer_contracts/blob/main/contracts/OpenPeerEscrow.sol) | Order-based escrow; buyer-side funding; partner fees; timeouts |
| **Escrowflow** | [escrowflow.co](https://www.escrowflow.co/) | Milestone USDC escrow (Sepolia demo) | Payer funds; releases per milestone |
| **Trustless Escrow (dual deposit)** | [GitHub](https://github.com/sol-contracts/Trustless-Escrow) | **Both** buyer and seller deposit; aligns incentives | Both must deposit before main payment lock |
| **Dual-deposit (academic)** | [USC / ICBC paper](https://anrg.usc.edu/www/papers/Dual_Deposit_ICBC_2019.pdf) | Both parties stake; cheat-proof digital delivery variant | On-chain deposits + verification rules |

#### Not escrow (common confusion)

| Name | URL | What it actually is |
|------|-----|---------------------|
| **ZenoLend** | [zeno.finance](https://zeno.finance/), [docs](https://docs.zeno.finance/) | **Lending** protocol (supply/borrow), not P2P escrow |
| **Essence Finance “ZEN” token** | [essencefinance.io](https://essencefinance.io/) | Scroll **stablecoin/DeFi** token named ZEN — not zen.lend |
| **Quill Finance** | [quill.finance](https://quill.finance/) | Collateralized borrowing on Scroll |

### 2.3 Industry pattern: dual-deposit vs single-deposit

- **Zenland / ConfiaPago / OpenPeer:** usually **one side funds** the trade amount (buyer/payer).
- **2Pescrow (your spec):** **both parties deposit** — closer to **Trustless Escrow** and **dual-deposit** research: stakes discourage walking away; both can verify each deposit on-chain.

The smart contract and UI must show **Party A balance / Party B balance / required amounts / status** clearly for beginners.

---

## 3. Architecture (text diagram)

```
                         ┌─────────────────────────────────────────┐
                         │           CLIENT APPLICATIONS            │
                         │  Web (Next.js) │ Android │ iOS           │
                         │  - WalletConnect / in-app wallet         │
                         │  - Same REST + WebSocket API               │
                         └────────────────────┬────────────────────┘
                                              │ HTTPS / WSS
                                              ▼
                         ┌─────────────────────────────────────────┐
                         │         API GATEWAY (Node.js)            │
                         │  Auth (JWT) │ Escrow CRUD │ Notifications│
                         └──────┬──────────────────────┬────────────┘
                                │                      │
              ┌─────────────────▼─────────┐   ┌────────▼──────────┐
              │      PostgreSQL            │   │  Redis (optional) │
              │  users, escrows_meta,      │   │  cache, job queue │
              │  indexed_events, devices   │   └────────┬──────────┘
              └─────────────────▲─────────┘            │
                                │                      │
              ┌─────────────────┴────────────────────────┴──────────┐
              │              INDEXER WORKER (Node.js)                │
              │  Poll/subscribe Scroll RPC → reconcile escrow state  │
              │  Emit webhooks / push when deposits confirm            │
              └─────────────────────────┬────────────────────────────┘
                                        │ JSON-RPC
                                        ▼
              ┌─────────────────────────────────────────────────────┐
              │              SCROLL BLOCKCHAIN (L2)                  │
              │  EscrowFactory → EscrowDeal clones (per deal)          │
              │  ERC-20 (USDC/USDT/WETH) + native ETH                  │
              │  Source of truth for ALL fund movements                │
              └─────────────────────────────────────────────────────┘
                                        ▲
                                        │ signed txs
              ┌─────────────────────────┴─────────────────────────────┐
              │  USER WALLETS (MetaMask, Rabby, mobile wallets)        │
              │  Party A & Party B — keys stay on device               │
              └───────────────────────────────────────────────────────┘

Optional later:
  - Email/SMS (SendGrid, Twilio) for "your counterparty deposited"
  - IPFS / object storage for agreement PDF hash (mirror Zenland pattern)
  - The Graph or custom indexer if event volume grows
```

**Principle:** Funds never sit in the PostgreSQL database. Postgres stores **labels, UX, and a copy of chain events** for fast queries; if Postgres and chain disagree, **chain wins**.

---

## 4. Escrow smart contract design (Scroll)

### 4.1 Contracts (Solidity ^0.8.20, OpenZeppelin)

| Contract | Role |
|----------|------|
| `EscrowFactory` | Creates a new `EscrowDeal` per agreement; optional protocol fee recipient |
| `EscrowDeal` | Holds deposits for **partyA** and **partyB**; state machine; release/refund/cancel |
| `TokenWhitelist` (optional) | Only allow USDC/USDT/WETH on mainnet MVP |

### 4.2 Deal parameters (set at creation)

- `partyA`, `partyB` — wallet addresses (checksummed).
- `token` — ERC-20 address, or `address(0)` for native ETH.
- `depositA`, `depositB` — required amounts from each side (can be equal or asymmetric).
- `descriptionHash` — keccak256 of agreement JSON/PDF (optional but recommended).
- `acceptDeadline` — if counterparty never joins/deposits.
- `completionDeadline` — optional auto-refund path if stuck.
- `feeBps` + `feeRecipient` — small protocol fee on release (configurable, can be 0 for MVP).

### 4.3 State machine

```
Created → ADeposited → BDeposited → Active → ReleasePending → Completed
                ↘           ↘          ↘
                 Cancelled / Refunded / Expired (per rules)
```

| State | Meaning |
|-------|---------|
| `Created` | Deal exists on-chain; neither side fully funded |
| `ADeposited` / `BDeposited` | One side met their required deposit |
| `Active` | **Both** deposits satisfied — work/trade phase |
| `ReleasePending` | One party requested release; other must confirm (or timeout policy) |
| `Completed` | Funds distributed per rules; deposits returned or applied to payout |
| `Cancelled` | Mutual cancel or timeout before `Active` — deposits returned |

### 4.4 Core functions (user-facing)

| Function | Who | Action |
|----------|-----|--------|
| `deposit()` / `depositA()` / `depositB()` | Party A or B | Transfer tokens/ETH into contract |
| `acceptTerms()` | Counterparty | Acknowledge deal (optional if deposits imply acceptance) |
| `proposeRelease(toA, toB)` | Either | Suggest split of locked funds |
| `confirmRelease()` | Other party | 2-of-2 approve payout |
| `mutualCancel()` | Both sign | Return deposits minus gas logic |
| `claimRefundIfExpired()` | Either | If deadlines hit and counterparty never deposited |

**MVP settlement rule (simple):** When both confirm release, pay **`depositA + depositB`** according to agreed split (default 100% to B, 0% to A — configurable at create time for “payment vs collateral” deals).

**Advanced (post-MVP):** Milestones, hash-locked digital delivery (dual-deposit paper), arbitrator role (Zenland-style).

### 4.5 Events (for indexer & UI)

- `DealCreated(dealId, partyA, partyB, token, depositA, depositB)`
- `Deposited(party, amount, totalA, totalB)`
- `Activated()`
- `ReleaseProposed(proposer, toA, toB)`
- `Released(toA, toB)`
- `Cancelled(reason)`

### 4.6 Security checklist

- OpenZeppelin `ReentrancyGuard`, `SafeERC20`.
- Pull payments over push where possible.
- No arbitrary `call` to user-supplied addresses.
- Fixed parties — no changing `partyB` after first deposit.
- External audit before mainnet with real user funds.

---

## 5. Backend structure (Node.js / TypeScript)

Recommended layout: **NestJS** or **Fastify** + modular folders.

```
apps/
  api/                 # REST + WebSocket
  indexer/             # Scroll listener worker
packages/
  shared/              # Types, ABIs, Zod schemas
  db/                  # Prisma or Drizzle ORM migrations
contracts/             # Hardhat/Foundry (shared with CI)
docker/
```

### 5.1 API responsibilities

| Module | Responsibility |
|--------|----------------|
| **Auth** | Optional email/password or magic link; link wallet address via signed message (SIWE-style) |
| **Escrows** | Create off-chain record + return calldata/deal address for wallet to sign |
| **Users** | Profile, notification tokens |
| **Chain read** | Proxy read-only RPC calls for balances (cache briefly) |
| **Webhooks** | Internal: indexer → push notification service |

### 5.2 Indexer responsibilities

1. Watch `EscrowFactory` and `EscrowDeal` events from a known deployment block.
2. Upsert PostgreSQL `escrow_events` and update `escrows.status`.
3. Notify subscribed clients via WebSocket / FCM / APNs.

### 5.3 Key environment variables

- `SCROLL_RPC_URL`
- `ESCROW_FACTORY_ADDRESS`
- `DATABASE_URL`
- `JWT_SECRET`
- `WALLET_INDEXER_START_BLOCK`
- (Optional) `ALCHEMY_OR_INFURA_KEY` for reliable RPC

---

## 6. PostgreSQL database schema

Logical schema (implement with Prisma/Drizzle migrations).

### `users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | VARCHAR UNIQUE NULL | Optional login |
| display_name | VARCHAR | |
| created_at | TIMESTAMPTZ | |

### `wallets`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| address | VARCHAR(42) UNIQUE | Lowercase storage; display checksummed |
| verified_at | TIMESTAMPTZ | After SIWE signature |
| is_primary | BOOLEAN | |

### `escrows`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| chain_id | INT | 534352 |
| contract_address | VARCHAR(42) UNIQUE | EscrowDeal proxy/instance |
| factory_tx_hash | VARCHAR(66) | |
| party_a_address | VARCHAR(42) | |
| party_b_address | VARCHAR(42) | |
| token_address | VARCHAR(42) NULL | NULL = ETH |
| deposit_a_wei | NUMERIC(78,0) | Store as string/bigint in app |
| deposit_b_wei | NUMERIC(78,0) | |
| title | TEXT | Human-readable |
| description_hash | VARCHAR(66) NULL | On-chain mirror |
| status | ENUM | mirrors chain + UX states |
| created_by_user_id | UUID FK | |
| created_at | TIMESTAMPTZ | |

### `escrow_events`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| escrow_id | UUID FK | |
| event_name | VARCHAR | e.g. Deposited |
| block_number | BIGINT | |
| tx_hash | VARCHAR(66) | |
| log_index | INT | |
| payload | JSONB | Amounts, party, etc. |
| created_at | TIMESTAMPTZ | |

### `devices`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| platform | ENUM | ios, android, web |
| push_token | TEXT | FCM/APNs |

### `notifications`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| type | VARCHAR | deposit_confirmed, release_requested |
| escrow_id | UUID FK | |
| read_at | TIMESTAMPTZ NULL | |

---

## 7. Docker setup

### 7.1 Compose services (development)

| Service | Image / build | Ports |
|---------|---------------|-------|
| `postgres` | postgres:16-alpine | 5432 |
| `redis` | redis:7-alpine | 6379 |
| `api` | Dockerfile `apps/api` | 3000 |
| `indexer` | Dockerfile `apps/indexer` | — |
| `web` | Dockerfile `apps/web` | 3001 |

Mobile apps build **outside** Docker on your Mac/PC (Android Studio / Xcode); they point to `http://localhost:3000` or tunneled URL via env.

### 7.2 Example compose outline

```yaml
# docker-compose.yml (conceptual)
services:
  postgres:
    environment:
      POSTGRES_DB: twopescrow
      POSTGRES_USER: twopescrow
      POSTGRES_PASSWORD: dev_only_change_in_prod
  api:
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgresql://twopescrow:dev_only_change_in_prod@postgres:5432/twopescrow
      SCROLL_RPC_URL: https://rpc.scroll.io/
  indexer:
    depends_on: [postgres, api]
  web:
    depends_on: [api]
```

Production: same images, secrets from a vault, managed Postgres, HTTPS reverse proxy (Caddy/Traefik/nginx).

---

## 8. Client apps: Android, iOS, and web (one API)

### 8.1 Shared API contract

- **OpenAPI** spec generated from backend → typed clients for web and mobile.
- Version prefix: `/v1/...`
- Auth: `Authorization: Bearer <jwt>` for account features; wallet actions still require **on-device signing**.

### 8.2 Web

- **Next.js** (App Router), **wagmi** + **viem**, **WalletConnect**.
- Pages: Dashboard, Create escrow, Escrow detail (live balances), Settings.

### 8.3 Mobile (recommended: React Native + Expo)

- **One codebase** for Android and iOS.
- **WalletConnect** for external wallets; optional embedded wallet later.
- Push via FCM (Android) and APNs (iOS) when indexer detects counterparty deposit.

### 8.4 How clients stay in sync

1. User opens escrow → API returns metadata + last indexed state.
2. Client also reads **direct RPC** `balanceOf(deal)` for trust-but-verify.
3. WebSocket channel `escrow:{id}` pushes updates when indexer catches new events.

---

## 9. Deposit → verify → release flow (two parties)

Plain-language walkthrough for **Alice (Party A)** and **Bob (Party B)**.

### Step 0 — Agree off-chain

They agree on: what is being exchanged, how much each deposits (e.g. Alice 100 USDC, Bob 50 USDC as collateral), and deadline. They do **not** need to trust a company — they trust the **public contract code**.

### Step 1 — Create deal

- Alice (or Bob) opens **2Pescrow** → Create escrow → enters Bob’s wallet address, amounts, token (e.g. USDC on Scroll).
- App shows a **deal page** and (after deployment) a **contract address** on [scrollscan.com](https://scrollscan.com/).
- Bob receives a **link** or finds the deal by ID after connecting the same wallet address.

### Step 2 — First deposit

- Alice taps **Deposit my share**. Wallet pops up → she approves USDC spend → confirms transfer.
- Within ~seconds, Scroll confirms. **Both** see: “Alice deposited 100 / 100 USDC.”
- Bob verifies on Scrollscan if he wants: token balance of the escrow contract increased.

### Step 3 — Second deposit (dual visibility)

- Bob taps **Deposit my share** (50 USDC).
- UI shows **both** progress bars green when `Active`.
- If Bob never deposits before deadline, Alice can **claim refund** per contract rules.

### Step 4 — Verify (the “both can see and verify” moment)

Each side checks:

- App dashboard: party balances, state `Active`.
- Block explorer: same contract address, same token balances.
- Optional: agreement hash matches what they signed in the app.

Neither side can silently withdraw the other’s deposit without following contract rules.

### Step 5 — Release

- When the real-world deal is done, one proposes **Release** (e.g. pay Bob 100 USDC from locked pool, return 50 USDC collateral to Bob).
- Other party **confirms**.
- Contract transfers tokens; event `Released` appears; app shows **Completed**.

### Step 6 — If something goes wrong (MVP)

- **Mutual cancel** before release (both confirm) → deposits return.
- **Post-MVP:** dispute window, third-party arbitrator, or partial split (Zenland-style).

---

## 10. Phased build order (MVP first)

### Phase 0 — Foundations (1–2 weeks)

- Monorepo, Docker Compose, Postgres, empty API health check.
- Hardhat/Foundry on local chain; deploy `EscrowFactory` + one `EscrowDeal` template.
- Document wallet setup for Christian (see Section 12).

### Phase 1 — MVP core (4–6 weeks)

**Goal:** Web-only usable end-to-end on local chain, then Scroll mainnet with test amounts.

| Deliverable | Done when |
|-------------|-----------|
| Smart contracts | Dual deposit, active state, mutual release, refund on timeout |
| Indexer | All events in Postgres |
| Web app | Create, deposit, view both balances, release |
| API | Escrow CRUD + SIWE wallet link |
| No mobile yet | — |

### Phase 2 — Mobile + notifications (3–4 weeks)

- React Native app: feature parity with web escrow flows.
- Push notifications on deposit/release.
- TestFlight / internal Android APK.

### Phase 3 — Hardening (3+ weeks)

- Scroll mainnet deployment, verified contracts on Scrollscan.
- Rate limits, monitoring, error tracking (Sentry).
- Security review / external audit budget.
- Optional: USDC-only whitelist, fiat off-ramp **not** in scope unless you ask.

### Phase 4 — Enhancements

- Milestone escrows (Escrowflow-style).
- Optional dispute agent + staking (Zenland-style).
- Multi-token support, fee switch, analytics dashboard.

---

## 11. Crypto concepts (plain language)

| Term | What it means for 2Pescrow |
|------|----------------------------|
| **Blockchain** | A public notebook everyone can read; no one can erase past entries. Scroll is a cheaper/faster notebook tied to Ethereum security. |
| **Wallet** | An app holding **keys** that control your crypto address. You approve each payment. |
| **Address** | Like an account number (`0x…`). Share it to receive funds; never share your **seed phrase**. |
| **Smart contract** | A program on Scroll that holds funds and follows rules automatically. |
| **Escrow** | Funds locked in that program until conditions are met. |
| **Token (USDC)** | Digital dollars as a token contract. Deposits use `approve` + `transferFrom`. |
| **Transaction** | One signed action (deposit, release). Costs a small **gas** fee in ETH on Scroll. |
| **On-chain ledger** | Balances and events visible on Scrollscan — the source of truth. |
| **Non-custodial** | 2Pescrow backend cannot move your money; only your wallet signatures can. |
| **Indexer** | Our server copies chain events into Postgres so the app loads quickly. |

---

## 12. What Christian sets up vs what engineering builds

### 12.1 You (Christian) — step-by-step

Do these **before** mainnet real money; we can start coding with a wallet you create in Phase 0.

#### A. Scroll wallet (required)

1. Install **[MetaMask](https://metamask.io/)** or **[Rabbi](https://rabby.io/)** browser extension.
2. Create a **new** wallet; write the **12/24-word seed phrase** on paper; store offline; **never** paste it in chat or email.
3. Add **Scroll Mainnet** in the wallet:
   - Network name: `Scroll`
   - RPC URL: `https://rpc.scroll.io/`
   - Chain ID: `534352`
   - Currency: `ETH`
   - Explorer: `https://scrollscan.com`
4. Send your **public address** (`0x…`) to the dev team — **not** your seed phrase.

#### B. Test funds (required for mainnet testing)

1. Acquire a small amount of **ETH on Scroll** for gas (bridge from Ethereum via [Scroll bridge](https://scroll.io/bridge) or buy/withdraw from an exchange that supports Scroll).
2. Acquire a small amount of **USDC on Scroll** for escrow tests (check Scrollscan token list for official USDC contract address before sending).
3. Keep test amounts tiny until audit completes.

#### C. Deployer / owner wallet (required for contract go-live)

You **can** own the deployer wallet, or use a multisig later.

1. Create a **separate** wallet (or hardware wallet) labeled `2Pescrow Deployer`.
2. Fund it with ETH on Scroll for deployment gas.
3. Share the **address** with engineering — we will deploy from it **or** you click deploy in a script we provide.

**You do not need to write Solidity** unless you want to; engineering delivers bytecode + verified source on Scrollscan.

#### D. Services & API keys (you create accounts — engineering tells you when)

| Service | Purpose | When |
|---------|---------|------|
| **WalletConnect Cloud** | Mobile/web wallet pairing | Phase 1 |
| **RPC provider** (Alchemy, Infura, or Ankr) | Reliable Scroll RPC | Phase 1 |
| **Firebase** (FCM) | Android push | Phase 2 |
| **Apple Developer Program** | iOS TestFlight/App Store | Phase 2 |
| **Google Play Console** | Android distribution | Phase 2 |
| **Domain + DNS** (e.g. `2pescrow.com`) | Production web | Phase 3 |
| **Email provider** (SendGrid/Postmark) | Optional login emails | Phase 2+ |

Send API keys through a **password manager share** or secrets vault — not plain email.

#### E. Legal / business (recommended, not code)

- Terms of service, privacy policy, jurisdiction.
- Clarify you are **software**, not a licensed escrow agent, unless counsel says otherwise.

#### F. What you asked explicitly

> “If there is any services you want me to go create so I could give you my crypto address or if you want me to create a contract…”

| Item | Who creates it |
|------|----------------|
| Your personal **Scroll wallet address** | **You** — share `0x…` only |
| **Escrow smart contracts** | **Engineering** — you approve deploy tx or deployer wallet pays gas |
| **Factory ownership / admin** | **You** (recommended) — transfer `Ownable` to your multisig after audit |
| **PostgreSQL, Docker, apps** | **Engineering** — runs on your cloud or local machine |
| **USDC token contract** | Already exists on Scroll — **do not** create a new USDC |

You **do not** need to create a custom token for MVP unless you want a protocol fee token later.

### 12.2 Engineering builds

- All smart contract code, tests, deployment scripts, Scrollscan verification.
- Backend API, indexer, Postgres schema, Docker images.
- Web + Android + iOS clients.
- CI pipeline (lint, test, contract test, build images).

---

## 13. Risks, compliance, and open decisions

| Topic | Notes |
|-------|-------|
| **Regulation** | P2P escrow may be regulated in your country; get legal advice before marketing. |
| **Scroll Sepolia gone** | Use local dev chain + careful mainnet testing. |
| **Token choice** | MVP: **USDC on Scroll** only reduces user confusion. |
| **Disputes** | MVP is 2-of-2; deadlocks need mutual cancel or future arbitrator. |
| **Zenland lesson** | Strong UX + clear states; optional agents for disputes; v2 shows importance of sustainable ops. |

### Open decisions for you

1. **Symmetric deposits** (50/50) vs **payment + collateral** (100 + 50) as default template?
2. **Protocol fee** (0% for launch vs small %)?
3. **Login required** or wallet-only like ConfiaPago?
4. **React Native (Expo)** acceptable for both mobile stores?

---

## Appendix A — Quick reference links

| Resource | URL |
|----------|-----|
| Scroll docs | https://docs.scroll.io/ |
| Scroll RPC | https://rpc.scroll.io/ |
| Scrollscan | https://scrollscan.com/ |
| Zenland (likely “zen.lend” reference) | https://zen.land/ |
| Zenland how-it-works | https://docs.zen.land/getting-started/how-it-works |
| ConfiaPago (Scroll P2P escrow example) | https://github.com/HackBalam/ConfiaPago-Scroll-57 |
| Dual-deposit pattern (research) | https://github.com/sol-contracts/Trustless-Escrow |

---

## Appendix B — Glossary

- **2Pescrow** — this product.
- **Party A / Party B** — the two users in one escrow deal.
- **Active** — both required deposits are on-chain.
- **SIWE** — Sign-In With Ethereum; proves you control a wallet.

---

*End of project plan.*
