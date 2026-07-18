# Releasing D-Chat

This document covers the actual mechanics of building a release APK and
publishing updates that existing users can install without losing their
data.

## The one rule that matters most

**Every release must be signed with the exact same keystore.** Android
refuses to install an update if it's signed with a different key than
what's already on the device (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` — you
hit this earlier in development when switching between a debug build and
an EAS-signed build). Since D-Chat deliberately wipes all local data on
uninstall (`android:allowBackup="false"`, by design), losing your signing
key means every user has to uninstall-and-lose-everything to receive any
future update. **Back up your release keystore somewhere safe and
durable before your first public release.**

---

## Step 1 — Generate a release keystore (one time only)

If you're using EAS Build, it can generate and manage this for you:

```bash
eas credentials
```
Select Android → select the `production` profile → let EAS generate a
new keystore. EAS stores it securely and reuses it for every future
`eas build` automatically — you don't need to manage the file yourself.

**If you'd rather manage it yourself** (e.g. for full independence from
Expo's infrastructure):

```bash
keytool -genkeypair -v \
  -keystore d-chat-release.keystore \
  -alias d-chat-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password and key password — **save
these somewhere durable** (a password manager, not just a text file on
the same machine). Losing the keystore or its passwords is unrecoverable
— there is no reset mechanism, by design, since that's exactly the kind
of backdoor this project avoids.

**Back it up now, immediately, before you forget:**
```bash
# Encrypt it before storing anywhere off this machine
gpg -c d-chat-release.keystore
# → produces d-chat-release.keystore.gpg — store THIS somewhere durable
#   (a password manager's file storage, an encrypted USB drive, etc.)
```

---

## Step 2 — Bump the version for every release

Open `app.json` and increment **both** values:

```json
{
  "expo": {
    "version": "1.1.0",
    "android": {
      "versionCode": 2
    }
  }
}
```

- `version` — human-readable (shown to users), follow semver (`1.0.0` → `1.1.0`)
- `versionCode` — **must strictly increase** on every single release, or
  Android will refuse to install it as an "older" version even if
  everything else is correct

---

## Step 3 — Build the signed release APK

**Using EAS (recommended — handles signing automatically):**

```bash
eas build --platform android --profile production
```

Update `eas.json` first if you haven't set up a production profile:
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

**Building locally instead:**

```bash
cd android
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=/path/to/d-chat-release.keystore \
  -Pandroid.injected.signing.store.password=YOUR_STORE_PASSWORD \
  -Pandroid.injected.signing.key.alias=d-chat-release \
  -Pandroid.injected.signing.key.password=YOUR_KEY_PASSWORD
```

Output APK lands at:
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## Step 4 — Publish to GitHub Releases

```bash
git tag v1.1.0
git push origin v1.1.0
```

Then on GitHub:
1. Go to **Releases** → **Draft a new release**
2. Choose the tag you just pushed
3. Write release notes (what changed, any migration notes for users)
4. Attach the `.apk` file as a release asset
5. Publish

Users download the new `.apk` from this release page and install it
directly over their existing app — since it's signed with the same key,
Android treats it as a normal in-place upgrade and **all local data
(contacts, messages, identity) is preserved automatically.**

---

## Step 5 — (Optional) Give users an easy way to check for updates

Since this app deliberately avoids any silent background phone-home
behavior, there's no automatic update notification. If you want to give
users a low-friction way to check for new versions **without** silent
telemetry, the acceptable middle ground is an explicit, user-initiated
check — e.g. a "Check for updates" button in a settings screen that,
*only when tapped*, fetches:

```
GET https://api.github.com/repos/<you>/d-chat-react/releases/latest
```

and compares the returned tag against the app's own `versionCode`. This
is not implemented in the current codebase — it's a reasonable future
addition, as long as it stays strictly opt-in (never automatic, never on
launch) to preserve the zero-telemetry design.

---

## Database migrations across releases

If a release changes the SQLite schema (as happened when `username` was
renamed to `nickname`), make sure `src/db/database.js`'s
`runColumnMigrations()` handles the upgrade path **before** shipping —
every user's existing on-device database needs to transform correctly
the moment they open the updated app, since there is no server-side data
to fall back on. Test this specifically: install the *previous* release,
create some contacts/messages, then install the *new* release over it
and confirm nothing crashes and no data is lost.

---

## Quick checklist for every release

- [ ] Bumped `version` and `versionCode` in `app.json`
- [ ] Any new SQLite schema changes have a migration in `database.js`
- [ ] Built with the **same** release keystore as all previous releases
- [ ] Tested installing over a previous version (not a fresh install) — confirms data survives and any migrations run correctly
- [ ] Tagged the commit (`git tag vX.Y.Z`)
- [ ] Published to GitHub Releases with the `.apk` attached
- [ ] Release notes mention anything users should know (e.g. "re-add contacts" if a breaking identity change ever happens)
