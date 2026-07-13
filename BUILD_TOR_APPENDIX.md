
---

# ⚠️ Bare Workflow Migration (Tor Embedding)

This project was migrated from Expo **managed workflow** to **bare workflow**
via `npx expo prebuild --platform android` in order to add the native Tor
module (`android/app/src/main/java/com/dchat/app/tor/`).

## What this changes for you

- **The `android/` folder is now committed to git and hand-maintained.**
  Do NOT run `npx expo prebuild --clean` again — it will regenerate
  `AndroidManifest.xml`, `MainApplication.kt`, and `build.gradle` from
  scratch and **silently wipe** all of the following manual changes:
  - `android:allowBackup="false"`
  - `android:networkSecurityConfig` (certificate pinning)
  - Removed Firebase/FCM and Expo Updates metadata
  - Trimmed permissions (removed RECORD_AUDIO, SYSTEM_ALERT_WINDOW, storage)
  - The `TorPackage()` registration in `MainApplication.kt`
  - The three files in `android/app/.../tor/`

- **You can no longer use Expo Go.** Custom native modules (like our Tor
  bridge) cannot load in Expo Go under any circumstances — this is an
  Expo Go limitation, not a bug. From now on you need either:
  - A **development build** (`npx expo run:android` — builds and installs
    a debug APK with your native code, still supports Fast Refresh), or
  - A full **release APK** via `eas build` (see below).

## Building with EAS (still works, one caveat)

```bash
eas build --platform android --profile preview
```

EAS Build detects the `android/` folder automatically and builds your
custom native code — no extra config needed. The one caveat: EAS Build
runs Gradle on Expo's cloud servers, which need internet access to
`repo.maven.apache.org` and Maven Central to fetch `tor-android` and
`jtorctl` — this works out of the box on EAS's build servers.

## Building locally (faster iteration while developing the Tor module)

```bash
npx expo run:android
```

Requires Android Studio / Android SDK installed locally. This is much
faster than a full EAS cloud build while you're actively debugging the
native Tor code, since Gradle can use local caching.

## Certificate pinning — required before any release build

See `CERT_PINNING.md` — you must replace the two `PLACEHOLDER_PIN_*`
values in `android/app/src/main/res/xml/network_security_config.xml`
before building a release APK, or every connection to the relay will be
refused (cleartext fallback is intentionally disabled).

## Known gap: iOS

The Tor native module (`TorModule.java` / `TorWebSocketModule.java`) is
Android-only. `src/services/tor.js` throws a clear error if `startTor()`
is called on iOS. Embedding Tor on iOS requires a separate native module
written in Swift/Objective-C against Guardian Project's `Tor.framework`
(or a similar iOS Tor library) — not yet implemented in this repo.
