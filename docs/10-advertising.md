# Advertising & Partner Banners

This document describes how advertising works on Faucero: the c.cx.ua
first-party partner banner, the self-serve ad-network registry, the rewarded-ad
pipeline, and consent gating. It reflects the implementation as of August 2026.

---

## 1. c.cx.ua partner banner (zone 32)

### Architecture

The official one-line embed (`<script src="https://c.cx.ua/ad/serve/banner/32">`)
is hosted in a **same-origin static frame**:

```
public/ads/cxua/banner-frame.html   ← hosts the embed + measurement script
components/ads/cx-ua-ads.tsx        ← CxUaBanner (parent component)
```

`CxUaBanner` renders an `<iframe src="/ads/cxua/banner-frame.html?z=<zone>&t=<token>">`
and listens for `postMessage` size reports from the frame.

### Why not a sandboxed/srcdoc iframe?

Two hard requirements discovered during integration:

1. **Referrer validation.** The c.cx.ua serve endpoint validates the request's
   `Referer` against the registered site and returns an **empty 200 response**
   without it. A sandboxed or `srcdoc` iframe runs in an opaque origin, and the
   browser strips the referrer for cross-origin subresources no matter what
   `referrerPolicy` is set. Ads could never load from that architecture.
2. **`document.write`.** The served creative uses `document.write`, which only
   executes while a document is parsing. A real iframe document provides that.

A same-origin static frame satisfies both: the browser naturally sends the
`faucero.com` referrer, and the creative writes into the frame during parse.

Security note: because same-origin frames cannot be sandbox-opaque, the frame
page contains only the official embed. Click-through uses the creative's own
`target="_blank"`. The popup zone (31, `t=1` same-tab redirect) is disabled at
the component level and must never be re-enabled — see §5.

### Measurement & stability

The frame page reports its rendered creative size back via `postMessage`:

- Measures `<img>` natural dimensions first, then declared nested-iframe
  dimensions (`maxWidth`/`height` styles), then layout box as fallback.
- A plausibility band (`aspect ratio 0.15–14`) rejects garbage measurements.
- While any creative element exists in the served document, the final check
  re-runs every 1.5 s instead of declaring the slot empty — late-loading HTML
  ads are never collapsed.
- Once a creative has been measured ("sticky-once-seen"), a later empty verdict
  cannot unmount the banner within the same mount.
- If nothing was ever served, the banner renders **nothing** (no empty box).

The parent sizes the slot by aspect ratio (never upscaling past the creative's
natural width), so rotation between 468×60 / 300×250 / 970×250 formats changes
the banner height by design.

### Frequency capping (operator)

c.cx.ua applies **per-visitor frequency caps** configured in their publisher
panel for the zone. Symptoms when the cap is hit:

- The banner shows on the visitor's first pages (landing, auth) then stops on
  later pages (dashboard navigation) as the cap exhausts.
- Server returns an empty response; our code hides the slot cleanly.

Raise or remove the frequency limit in the c.cx.ua panel (Zone settings →
Frequency). Panel changes apply automatically — no code change needed. Verify
with a fresh incognito session (new visitor identity).

### CSP note (operator)

The production `Content-Security-Policy-Report-Only` header is configured in
the Vercel dashboard. Its `script-src` allowlist does not yet include the ad
network, so every banner load logs a console violation. Report-only policies do
not block anything, but before ever switching the policy to enforcing mode, add:

```
https://c.cx.ua
```

to `script-src` (and `frame-src` if you embed other providers) in the Vercel
headers configuration.

### Troubleshooting checklist

| Symptom | Cause | Fix |
|---|---|---|
| Empty response from serve endpoint | Missing/wrong referrer | Frame architecture handles this; verify `faucero.com` is the registered domain in the panel |
| Banner appears then disappears | Old build (pre-measurement-fix) | Hard refresh; service-worker cache version forces update |
| Ads stop after a few pages | Per-visitor frequency cap | Raise cap in panel |
| No banner at all | Marketing consent off, DNT on, or cap exhausted | Check `/cookies`; test in incognito |
| Works logged-out but not logged-in | Not a code path difference | Same components everywhere; check cap/consent |

---

## 2. Self-serve ad-network registry

`app/dashboard/advertise` lists **9 real publisher-integrated self-serve
networks**: Adsterra, PropellerAds, HilltopAds, Coinzilla, Bitmedia, A-ADS,
Cointraffic, TrafficStars, MellowAds. Fictional/consumer networks were removed;
do not reintroduce them.

- Registry: `lib/ads/registry.ts` (`AD_NETWORK_REGISTRY`, `isNetworkRenderable`)
- Admin toggle + encrypted configs: `components/admin/ad-network-settings.tsx`
  (configs are encrypted at rest and never returned to the client)
- All networks ship **disabled** until the operator verifies each account.
  Fail-closed: with zero enabled networks, placements render a single clean
  c.cx.ua card instead of empty grid chrome.

Advertiser deposits fund `ad_balance_usd` (CCPayment checkout or instant
FaucetPay-balance conversion); unused budget refunds to `ad_balance_usd` and can
be cashed out to FaucetPay via `/api/advertise/cashout`.

---

## 3. Rewarded ads (S2S)

Payout only after server-to-server postback verification. Client timers never
unlock anything.

Environment contract:

```
NEXT_PUBLIC_REWARDED_ADS_ENABLED=true     # master gate
REWARDED_ADS_PROVIDER=<provider>          # primary provider id
REWARDED_ADS_SECRET=<shared secret>       # postback signature secret
# optional per-provider secrets:
REWARDED_ADSTERRA_SECRET=...
REWARDED_PROPELLERADS_SECRET=...
REWARDED_HILLTOPADS_SECRET=...
REWARDED_ADGEM_SECRET=...
```

Register the postback URL with each provider:

```
https://www.faucero.com/api/ads/rewarded-callback?network=<provider>
```

Flow: signature verification → idempotent event insert (`rewarded_ad_events`,
txid-keyed) → single-use 10-minute watch token bound to userId+txid → claim
endpoint credits via atomic RPC. Replays cannot double-fund.

Until keys are set, all rewarded surfaces render nothing and the APIs fail
closed (503). Status text derives from the live gate — it is never hardcoded.

---

## 4. Consent gating

Every ad surface gates on **Marketing** cookie consent (`lib/consent/store.ts`,
shared store + `cookie-preferences-updated` event) and honors Do-Not-Track.

- Consent undecided → nothing renders (silent).
- Consent explicitly declined → public pages show a small pill explaining why
  ads are hidden, with a one-click Enable action.
- `/cookies` preferences page toggles marketing on/off.

There is a single consent store and a single banner component — there are no
duplicate consent implementations.

---

## 5. Popup policy (non-negotiable)

The c.cx.ua popup loader previously ran zone 31 in `t=1` mode — a **same-tab
redirect**, which is a browser-hijacker pattern and a reputation-scanner red
flag (GridinSoft et al.). It is now:

- Disabled on dashboard and auth layouts (`disablePopup` prop), and
- **Hard-refused inside `CxUaPopupLoader`** regardless of caller or config.

Do not re-enable same-tab redirect popups anywhere. Same-site reputation takes
months to rebuild and days to destroy.
