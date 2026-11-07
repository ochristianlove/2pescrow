# 2Pescrow store setup

Native Expo app in `apps/mobile`. Bundle id and package name are both `com.twopescrow.app`. Version `0.1.0`, iOS build `1`, Android version code `1`.

Replace the placeholders below before a public listing. Internal testing can start once the signing accounts are connected.

## Privacy policy URL

Placeholder: `https://2pescrow.com/privacy`

The page already exists in the website at `/privacy`. App Store and Play Console reject a non-HTTPS or LAN address. Publish that page on the real domain, then put the HTTPS URL in:

- App Store Connect → App Information → Privacy Policy URL
- Play Console → App content → Privacy policy
- `apps/mobile/app.json` → `extra.privacyPolicyUrl`

## Support

Placeholder email: `support@2pescrow.com`  
Placeholder URL: `https://2pescrow.com`

## Listing copy

**Title:** 2Pescrow

**iOS subtitle:** Peer-to-peer crypto escrow

**Play short description (80 characters):**  
Two people trade directly. Payment stays in a smart contract.

**Full description:**

2Pescrow is peer-to-peer escrow for two people. The buyer pays from their own wallet into an escrow smart contract. 2Pescrow does not hold that money and is not a bank.

Open a trade, share a private code, and meet in one room. The coins stay in the contract until the deal is finished or a dispute is paid out under the contract rules. Chat, evidence, and your email stay on 2Pescrow. Wallet addresses and token transfers are public on the chain.

This test build covers sign-in, creating a trade, joining with a code, the trade room, disputes, the public ledger, and the FAQ. Funding and release are signed in your wallet on the website.

## Screenshots

Capture on a signed-in phone, light status bar, no debug menus.

1. Sign-in, with the one-line description visible.
2. Trade list, including an empty or a real trade.
3. A trade room showing the join code.
4. New trade form.
5. FAQ with one answer open.

**iOS (required for iPhone):**

- 6.7-inch: 1290 × 2796 (or 1320 × 2868 on newer simulators)
- 6.5-inch: 1284 × 2778, if App Store Connect still asks

Tablet is off (`supportsTablet: false`), so iPad screenshots are not required.

**Android:** at least 2 phone screenshots, PNG or JPEG, min side 320px, max side 3840px. 1080 × 1920 is a safe set. Feature graphic for the store listing: 1024 × 500. Do not put that graphic in the app binary.

The icon in `assets/icon.png` is a first mark for testing. Swap it before the public listing if you want the final brand tile. iOS masks icons itself, so the master file should be a full square without a pre-rounded frame. The current file has rounded corners baked in.

## What you need to provide

- Apple Team ID, from [developer.apple.com/account](https://developer.apple.com/account). The Apple Developer Program membership is already purchased; the Team ID is on the membership page.
- App Store Connect access for the same Apple ID, and the numeric Apple ID of the new app (eas.json `ascAppId`).
- A Mac is not required if you build in Expo’s cloud (EAS). Local iOS builds need Xcode on a Mac. This PC cannot archive an iOS app.
- Google Play Console access. Play App Signing stays on. Save the Android upload keystore EAS creates. Losing it blocks updates if you later turn Play App Signing off.
- Expo account (`npx eas login`) if you use EAS. Run `npx eas init` inside `apps/mobile` and commit the `extra.eas.projectId` it writes.
- Production API URL on HTTPS, and the matching website URL. The phone build reads `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN`. The current `.env` points at `http://10.148.130.68:3002` and `:3003` for a same-network test. Store builds must use HTTPS. Turn off Android cleartext (`usesCleartextTraffic`) on that build.
- Final icon, if you replace `assets/icon.png`, `assets/adaptive-icon.png`, and `assets/splash.png`.
- The public privacy URL and the support email, once they are real.
- A signing certificate is created in the Apple flow below. You do not buy a separate certificate. Android uses the upload keystore from the first EAS or Android Studio build.

## Phone test before the stores (this PC)

1. Phone on the same Wi-Fi as the PC. API must answer at `http://10.148.130.68:3002/health`.
2. From `apps/mobile`: `npm install` then `npx expo start`.
3. Install Expo Go and scan the QR code. That runs the JavaScript. It is not the store binary.
4. Sign in with the email link, then paste that link into the app. The email still opens the website path; the app reads the token from the pasted URL.

## TestFlight

1. App Store Connect → Apps → New App. Platform iOS. Name `2Pescrow`. Bundle ID `com.twopescrow.app`. SKU `2pescrow-ios`. You create the bundle id under Certificates, Identifiers & Profiles if it is not listed. Enable Associated Domains only after `2pescrow.com` serves the Apple app site association file.
2. On a machine with Node 20: `npm install -g eas-cli`, `cd apps/mobile`, `npx eas login`, `npx eas init`.
3. `npx eas build --platform ios --profile production`. Sign in with the Apple ID when asked. Let EAS create the distribution certificate and the App Store provisioning profile. Download and store those credentials from the Expo site.
4. `npx eas submit --platform ios --profile production`. Or upload the `.ipa` with the Transporter app.
5. App Store Connect → TestFlight → the build. Answer the export compliance prompt (the app sets `ITSAppUsesNonExemptEncryption` to false because it only uses standard HTTPS). Add internal testers by their Apple ID email. They install TestFlight, accept the invite, and install 2Pescrow.
6. External testers need a short Beta App Review. Internal testers (App Store Connect users) do not.

## Play Console internal testing

1. Play Console → Create app. Name `2Pescrow`. App, free, and the declarations you can answer today.
2. `cd apps/mobile` then `npx eas build --platform android --profile production`. This produces an `.aab`. Let EAS create the upload keystore and download a backup.
3. `npx eas submit --platform android --profile production`, or upload the `.aab` by hand to the Internal testing track.
4. Play Console → Testing → Internal testing → create a release, add the bundle, roll out.
5. Testers tab → create an email list and copy the opt-in link. Testers need a Google account, must accept the invite, and install from the Play Store. The first review of a new app can take longer than an update. Internal testing is still a Play review, but it is the fastest track.
6. App content: privacy policy URL, ads (no), content rating questionnaire, target audience, and data safety. Declare email, name, wallet address, and messages as collected, and that on-chain transfers are public. Do not claim the app collects nothing.

## Signing notes

- iOS: one Apple Distribution certificate and one App Store profile for `com.twopescrow.app`. EAS can create both. Do not revoke the certificate after TestFlight is working.
- Android: first upload key signs the `.aab`. Google then re-signs with the app signing key. Keep the upload keystore (`.jks` and its passwords) offline.
- Deep link host `2pescrow.com` and path `/auth/verify` are reserved in the app. They start working when the website serves `/.well-known/apple-app-site-association` (Team ID + `com.twopescrow.app`) and `/.well-known/assetlinks.json` (Play signing SHA-256). Until then, testers paste the email link.
