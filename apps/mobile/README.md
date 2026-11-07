# 2Pescrow mobile

Native iOS and Android app (Expo) for the same `/v1` API as the website.

Signed-in testers can request a magic link, paste it to sign in, see their trades, create a code trade, join with a code, chat, open a dispute, read the public ledger and the FAQ, set a display name, link a wallet address, and get a referral link. Funding and release stay on the website, because those transactions are signed in the wallet.

## Run on a phone

```bash
cd apps/mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN` in `.env`. A physical phone cannot use `localhost`. See `.env.example`.

Store ids, TestFlight, Play internal testing, listing copy, and the privacy URL placeholder are in `STORE.md`.

Bundle id / package: `com.twopescrow.app`.
