# Per-release manual verification checklist

Automated gates are necessary but do not prove live vendor billing, browser consent,
or staging database behavior. Run this checklist against staging before production.

## Automated gates

- [ ] `npm run typecheck` passes with zero diagnostics.
- [ ] `npm run lint` exits 0; warnings are reviewed and not new correctness errors.
- [ ] `npm run test` passes all test files.
- [ ] `npm run build` passes after deleting `.next` and `*.tsbuildinfo`.
- [ ] `node scripts/migrate.mjs --dry-run` matches the reviewed migration set.
- [ ] Staging migration runner reports every applied checksum unchanged.

## Authentication and security

- [ ] Anonymous forged/unsigned Supabase cookies cannot reach admin data.
- [ ] Anonymous and non-admin requests to every admin API route return 403.
- [ ] Admin layout redirects rather than rendering fabricated admin chrome on timeout.
- [ ] Postback requests without a production secret return 403.
- [ ] Repeated postback transaction IDs do not double-credit after migrations are applied.
- [ ] Cross-site mutating requests are rejected; signed S2S webhooks remain exempt.
- [ ] CSP Report-Only violations are reviewed before enforcement is enabled.

## Consent and advertising

- [ ] Incognito first visit makes zero optional analytics/ad/vendor requests before choice.
- [ ] Reject optional leaves analytics and marketing tags absent.
- [ ] Accept all updates same-tab and cross-tab consumers.
- [ ] No unverified registry network renders a placeholder or invented tag.
- [ ] Hide the tab for two minutes: no ad-refresh requests are generated.
- [ ] Public c.cx.ua popup behavior is disabled unless the placement is explicitly
      approved for a user-initiated engaged surface; no surprise navigation occurs.
- [ ] Each enabled real vendor has a screenshot and panel impression evidence.

## First-party advertiser delivery

- [ ] Apply migrations 072–074 to staging with a database backup.
- [ ] Approve a safe HTTPS creative through the admin review route.
- [ ] Serve one impression and verify the rollup, campaign spend, and daily cap.
- [ ] Repeat the same viewer/slot/minute request: no duplicate billable impression.
- [ ] Click once: redirect is safe and the click rollup increments.
- [ ] Click repeatedly in the same hour: subsequent clicks are marked invalid.
- [ ] Reject/stop a campaign twice: exactly one refund is issued.

## AdSense readiness

- [ ] AdSense publisher approval is active before setting a publisher ID.
- [ ] A certified CMP/TCF 2.2 posture is configured for EEA/UK traffic, or AdSense
      remains geo-disabled there.
- [ ] AdSense is absent from all `/dashboard/**`, `/auth/**`, and `/admin/**` routes.
- [ ] `public/ads.txt` contains only lines for verified enabled publishers.
- [ ] Every public educational page has reviewed, attributable, substantive content.
