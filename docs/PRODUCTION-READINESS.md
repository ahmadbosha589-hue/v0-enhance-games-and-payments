# Production Readiness Snapshot

**Snapshot date:** 2026-10-09

**Scope:** local repository branch `launch-completion` and read-only checks of the canonical site. This is not a claim that production contains the pending branch changes.

## Verified

### Repository verification

- `npm run verify` (2026-10-09) exited 0: 363 tests across 72 files; zero
  TypeScript errors; zero ESLint errors (209 warnings); successful production
  build generating 195 static pages. The build also verifies the exact
  `next-themes` bootstrap hash used by nonce-based CSP responses.
- `npm audit --omit=dev` (2026-10-08) reported zero production dependency vulnerabilities.
- `npm audit --audit-level=critical` (2026-10-08) passed with zero critical vulnerabilities; npm reported five high findings, all in development tooling. Its available remediation proposes downgrading `eslint-config-next` to 14.2.35 (a major-version downgrade), so that was not applied to this Next.js 16 project.
- `npm run verify:launch -- --ci` (2026-10-08) exited 0 and passed code checks: 122 static environment names documented, 14 supported postback-secret providers found, and CSP enforcement configured.
- The strict local `npm run verify:launch` last checked on 2026-10-08 exited 1 because 25 required environment values were missing from that local process. It does not inspect Vercel settings and never prints values.
- `npm run smoke -- --base-url https://www.faucero.com` (2026-10-08) passed for all 17 anonymous public routes (HTTP 200).
- The local production build was served on 2026-10-09. HTTP checks found a single
  enforcing CSP and retained HSTS, framing, MIME, referrer, and permissions
  headers on five dynamic HTML routes and two static routes. Dynamic pages used
  nonce + `'strict-dynamic'` without `'unsafe-inline'`; static pages retained
  the compatibility policy. Headless Chromium observed no CSP violations on
  `/`, `/auth/login`, `/dashboard`, `/about`, `/blog/example`, or `/l/short-id`.
  This verifies only the local branch, not production.

### Current live response (2026-10-09, post-deploy of 9e2b8de)

`https://www.faucero.com/` now serves an **enforcing** `Content-Security-Policy`
with a per-request nonce, `'strict-dynamic'`, the pinned `next-themes` bootstrap
hash, and allowlists for CAPTCHA, c.cx.ua, AdsGram, legacy ad providers,
Supabase REST/realtime, and configured offerwall frame origins. It also returns
HSTS (`max-age=63072000`), `X-Frame-Options: SAMEORIGIN`,
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and the expanded
`Permissions-Policy` (accelerometer, camera, geolocation, gyroscope,
magnetometer, microphone, payment, usb — all denied). No
`Content-Security-Policy-Report-Only` header remains on the canonical root.

Verified post-deploy on 2026-10-09:

- Unauthenticated money endpoints refuse: `POST /api/admin/funds` → 401,
  `POST /api/admin/withdrawals/action` → 401, `POST /api/withdraw` → 401.
- Production `/` HTML: all executable inline scripts carry the request nonce;
  the one un-nonced inline script is the `next-themes` bootstrap, whose live
  body hashes byte-for-byte to the pinned
  `'sha256-zjP2BXYgSCCnXNMXI2IL1yRydoQdsGR/uCCr6kyKsD0='` allowed by the policy.
- Static `/about` serves the compatibility policy (`'unsafe-inline'`, no
  nonce/`strict-dynamic`) so prerendered pages remain cacheable.
- Live smoke: all 17 public routes returned HTTP 200.
- CI on `main` at `9e2b8de` completed with `success` (first CI run ever on
  this repo; the workflow previously targeted a nonexistent `master` branch).

### Production database and migrations

- The current production database migration state was not queried.
- Migration files `scripts/111_telegram_links.sql` and `scripts/112_ad_ad_completions.sql` exist in the repository; their production application must be verified separately.
- No current production database snapshot or rollback-based integration test was obtained for this snapshot. Historical counts and migration claims in the previous snapshot are not current evidence.

## Remaining launch blockers and unverified behavior

- Static pages still allow `'unsafe-inline'`; they have an enforcing
  compatibility policy, not a strong XSS-mitigation policy.

- Production browser check (2026-10-09, post-deploy, real origin): zero CSP
  violations or console blocks on `/`, `/about`, `/blog`,
  `/dashboard/offerwalls/ccxua`, and `/ads/cxua/banner-frame.html`. The
  c.cx.ua serve request (`https://c.cx.ua/ad/serve/banner/32`) completed with
  HTTP 200 and an **empty body** under the production Referer — identical to
  the pre-CSP behavior. The banner not rendering is a provider-side
  fill/registration condition (zone 32 / registered Referer host in the
  c.cx.ua publisher panel), **not** a CSP block. Nested creative destinations
  remain unobserved because no creative is currently delivered; verify after
  the operator confirms zone fill in the publisher panel.
- The local process lacks 25 required settings. Configure and validate required values in the hosting environment; the local launch check does not reveal Vercel's current values.
- Apply and verify migrations 111/112 in the intended Supabase project.
- Payment-provider test transactions, FaucetPay wallet funding, Telegram callbacks, offerwall postbacks, Redis cross-instance behavior, authenticated browser flows, load/abuse testing, and rollback drills remain unverified.

## Current production data snapshot

No fresh production database snapshot was taken. Historical profile, claim, transaction, conversion, campaign, and withdrawal counts are not current evidence and must not be represented as current business metrics.

## Launch policy

Do not treat the system as production-ready until the enforcing CSP is deployed and verified, operator settings and migrations are confirmed, and provider-specific gates are complete. Do not assert revenue, payout readiness, or external ad fill without read-back evidence. A controlled beta requires Redis, payment test transactions, consent behavior, and authenticated browser checks to pass.

## Evidence to retain before launch

- Migration checksum output.
- Database backup identifier and rollback plan.
- Screenshots/video of auth, consent, advertiser review, and withdrawal states.
- Provider webhook and signature test results.
- Redis rate-limit cross-instance test output.
- Lighthouse and mobile accessibility reports.
- Load/abuse test results.
