# D-Chat — Build & Distribution Guide

## Prerequisites

Install EAS CLI globally (one time):
```bash
npm install -g eas-cli
```

Create a free Expo account at https://expo.dev if you don't have one.

---

## Step 1 — Log in to Expo

```bash
eas login
```

---

## Step 2 — Link your project to Expo

```bash
eas init
```

This generates a `projectId` and updates `app.json` automatically.
You only do this once.

---

## Step 3 — Build the Android APK

```bash
eas build --platform android --profile preview
```

This builds a `.apk` file (not a Play Store bundle — a direct install file).

- Build runs on Expo's cloud servers (~5-10 min)
- No Android SDK or Java needed on your machine
- When done, EAS gives you a download link

---

## Step 4 — Share with friends (Android)

After the build completes:

1. Go to https://expo.dev → your project → Builds
2. Click the build → **Download** the `.apk`
3. Share the `.apk` file directly via:
   - WhatsApp / Telegram (send as file)
   - Google Drive link
   - AirDrop / USB

Friends install it by:
1. Opening the `.apk` on their Android phone
2. Tapping **Install** (allow "Install from unknown sources" if prompted)
3. That's it — no Play Store needed

---

## Step 5 — iOS (requires Apple Developer account)

```bash
eas build --platform ios --profile preview
```

Then distribute via **TestFlight**:
1. Build → Download `.ipa`
2. Upload to App Store Connect via Transporter
3. Add testers in TestFlight
4. Friends install via TestFlight link

> Apple Developer account costs $99/year.
> For just friends, Android APK sideloading is much easier.

---

## Updating the app

When you make changes:

1. Bump `versionCode` in `app.json` (Android) → `"versionCode": 2`
2. Run `eas build --platform android --profile preview` again
3. Share the new `.apk` — friends reinstall over the old version

---

## Environment checklist before building

Make sure these are correct in your files:

**`src/constants/config.js`**
```js
export const RELAY_WS_URL = 'wss://d-chat-relay-server-production.up.railway.app';
```

**`app.json`**
```json
"android": {
  "package": "com.dchat.app",
  "versionCode": 1
}
```

---

## Troubleshooting

**Build fails with "missing credentials"**
→ Run `eas credentials` and follow the prompts. EAS can auto-generate a keystore.

**"Install blocked" on Android**
→ Go to Settings → Security → Install unknown apps → allow your file manager or browser.

**App crashes on launch**
→ Run `eas build --platform android --profile preview --local` to see full error logs.
→ Or run `npx expo start` and check the Metro bundler console first.

**WebSocket not connecting**
→ Check your Railway deployment is running: `curl https://d-chat-relay-server-production.up.railway.app/health`
→ Verify `RELAY_WS_URL` in `src/constants/config.js` matches your Railway domain exactly.
