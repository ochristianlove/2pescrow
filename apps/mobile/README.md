# 2Pescrow mobile

Native iOS and Android app (Expo) for the same `/v1` API as the website.

Signed-in users can see their trades and shared activity, save creation drafts, create and join code trades, chat, attach photos or PDFs, confirm fulfilment, read the public ledger and FAQ, manage their profile, link a wallet, and use referrals. Funding, release, cancellation, and dispute actions open the same trade on the website for the complete wallet flow.

The header language menu offers English, French, Chinese, Spanish, Brazilian Portuguese, Russian, Indonesian, and Vietnamese. Product copy shares one catalog with the website; user-written messages and trade terms stay unchanged.

## Run on a phone

```bash
cd apps/mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_ORIGIN` in `.env`. A physical phone cannot use `localhost`. See `.env.example`.

## Standalone Android APK

For an Expo cloud build, run `npx --yes eas-cli@27.10.0 build --platform android --profile preview` from `apps/mobile`. The preview profile produces an installable APK using the existing EAS signing credentials. `.easignore` excludes generated native projects, local environment files, and backups; EAS regenerates Android from the checked-in app configuration. Production endpoints are in `app.json`.

The Android prebuild plugin pins Kotlin to 1.9.25, matching Expo 52's Compose compiler 1.5.15 ([Android compatibility map](https://developer.android.com/jetpack/androidx/releases/compose-kotlin)). Keep this pin in the Expo configuration: changing only a local generated Gradle file does not fix clean CI builds.

With Java 17 and the Android SDK installed, run `npx expo prebuild --platform android --non-interactive`, then `./gradlew assembleDebug` from `android` (`gradlew.bat` on Windows). The local config plugin embeds the JavaScript bundle even in a debug APK, so the installed app does not need Metro. The result is `android/app/build/outputs/apk/debug/app-debug.apk`.

For an existing installation signed with the same key, `adb install -r <apk>` updates it in place. Do not uninstall the old app to work around a signature mismatch: that would erase its local data.

CI checks the catalog coverage, native types, trade presentation, and prebuild plugin. The deployment workflow publishes the APK as an artifact and checks that its JavaScript bundle is present. The workflow is also available through manual dispatch; GitHub Actions must be enabled for the repository owner.

Store ids, TestFlight, Play internal testing, listing copy, and the privacy URL placeholder are in `STORE.md`.

Bundle id / package: `com.twopescrow.app`.
