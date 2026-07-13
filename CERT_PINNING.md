# Certificate Pinning — Getting the Correct Pin Value

## Why the earlier fingerprint doesn't work directly

Android's `network_security_config.xml` `<pin-set>` requires a base64-encoded
SHA-256 hash of the certificate's **Subject Public Key Info (SPKI)** — not a
hash of the whole certificate. These produce completely different values.

## Run this to get the correct pin

```bash
openssl s_client -connect d-chat-relay-server-production.up.railway.app:443 \
  -showcerts </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

This will output something like:
```
k3RJqk2rgOTk9y8YyGm6X5f3bT9zKvSGvbwFTfk4WvA=
```

**That base64 string is your primary pin.**

## ⚠️ Important: Railway's certificate rotation risk

Railway terminates TLS at their edge and the certificate is very likely
issued and auto-rotated by **Let's Encrypt**, which rotates certificates
roughly every **60-90 days**. If you pin only the leaf certificate's SPKI
hash, **your app will hard-fail to connect the moment Railway rotates the
cert** — and you'd need to ship an app update just to fix connectivity.

### Two ways to handle this:

**Option A — Pin the leaf + get a backup pin ready**
Pin today's certificate, and also fetch the pin for the certificate that
will likely be issued next (not generally predictable with Let's Encrypt —
this option is fragile for Railway specifically).

**Option B — Pin higher up the chain (recommended)**
Pin the **intermediate CA's** SPKI instead of the leaf. Let's Encrypt's
intermediate certificates (e.g. "R10", "R11", "E5", "E6") rotate far less
often than leaf certs, and Railway doesn't control when Let's Encrypt
rotates their own intermediates — but this is still far more stable than
per-leaf pinning.

Get the intermediate's pin:
```bash
openssl s_client -connect d-chat-relay-server-production.up.railway.app:443 \
  -showcerts </dev/null 2>/dev/null > /tmp/chain.pem

# This dumps the full chain — the SECOND certificate block is usually
# the intermediate CA. Extract it and hash it the same way as above.
awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print > ("/tmp/cert" NR ".pem")}' /tmp/chain.pem
```

**Option C — Self-host the relay with your own long-lived certificate**
Since you're already considering moving off Railway for the Tor hidden
service work, a self-hosted relay lets you use a certificate with a much
longer validity period (or a self-signed cert you fully control), making
leaf pinning stable and predictable.

## What I'm shipping in network_security_config.xml

I've included **two pin slots** (primary + backup) as Android requires
at least 2 pins for `<pin-set>` to be considered valid long-term (a
single pin with no backup is explicitly discouraged by Android's own
docs, because it creates exactly the hard-fail-on-rotation problem above).

Run the command above, then replace both `PLACEHOLDER_PIN_1` and
`PLACEHOLDER_PIN_2` in `network_security_config.xml` — use the leaf pin
for one slot and the intermediate CA pin for the other, so a leaf
rotation alone won't break connectivity.
