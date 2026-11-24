# 2Pescrow Repository Instructions for AI Agents

Follow these project rules on every task in this repository:

## 1. iOS Builds & SDK Requirement
- **Do NOT build future iOS App Store / TestFlight releases with iOS SDK 26.2 (`macos-sequoia-15.6-xcode-26.2`).**
- Before running the next iOS production build, update `apps/mobile/eas.json` (`build.production.ios.image`) to target **Xcode 27+ / iOS 27 SDK** (or the corresponding EAS image supporting iOS 27 SDK and above). Never re-pin Xcode 26.2.
- Keep CI monotonic build-number stamping in `.github/workflows/deploy.yml` and `.github/workflows/ios-production.yml` so Apple/Google never reject duplicate build numbers.
- Do not re-add a Terms/Privacy overlay to the mobile WalletConnect modal (`apps/mobile/app/_layout.tsx`), and preserve the iOS wallet-return deep-link handler (`apps/mobile/app/+native-intent.ts`, `apps/mobile/src/walletReturn.ts`).

## 2. Ethereum Mainnet Contracts & Backward Compatibility
- **Live Ethereum Mainnet V2 stack:**
  - `EscrowFactory` (V2): `0x8F18c320771a93D76832BbB30072c011f3e3c015`
  - `ResolverRouter` (two-tier: 11 Platform Resolvers + scoped Special Resolvers): `0x539627c8c809C8BdEBB3187F9462a1cD6a493C1E`
  - `EscrowDeal` V2 implementation (zero-gas seller fulfilment + automatic 50/50 Special Resolver fee split when `optionalAgent != 0`): `0xA0C3904Ab2fCB5AFaC8c564a00AaAef9505a8351`
- **Legacy V1 factory (must stay supported for existing trades):** `0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9`
- **Never** deploy mainnet contracts, move funds, or change live factory/fee settings without explicit owner approval and an exact gas/USD estimate first.
- Always preserve V1/V2 escrow bytecode capability detection (`packages/shared/src/escrowCompat.ts`) so existing V1 trades remain functional alongside new V2 trades.

## 3. Special Resolver Rules
- Standard trades (`optionalAgent == address(0)`) route **100%** of the 10% platform fee to `feeRecipient` and **0%** to resolvers.
- Special Resolver partner trades (`optionalAgent != address(0)`) automatically split the 10% fee **50/50** on-chain between the partner wallet and `feeRecipient`, and void manual referral commissions.
- Special Resolvers (`role = "special_resolver"`) are external partners scoped strictly to their own referred clients' trades—they must never view or claim general platform disputes.
