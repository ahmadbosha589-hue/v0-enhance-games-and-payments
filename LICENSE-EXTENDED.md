# Exclusive Asset Transfer — Commercial Rights and Handover

This document expands the buyer summary. The signed agreement in [`LICENSE`](LICENSE) and the bill of sale control if there is any conflict.

## Exclusive commercial rights

Once the purchase is fully paid and the transfer documents are signed, the buyer receives the exclusive worldwide right to use the Seller-owned custom asset in commercial products. The buyer may:

1. Operate the software as a single-site or multi-tenant service.
2. Create unlimited derivative deployments from the acquired asset.
3. Build client products or internal products from the acquired asset.
4. White-label, rebrand, modify, or replace the user interface.
5. Sublicense or resell the acquired Seller-owned asset.
6. Hire developers, agencies, or hosting providers to operate it under confidentiality terms.

The seller will not knowingly sell or license the assigned Seller-owned asset to another buyer after the effective transfer.

## Handover checklist

The bill of sale should identify which of these are included:

- Repository URL and transferred commit.
- Source archive.
- Database migration files.
- Deployment documentation.
- Domain name and registrar transfer.
- Brand name, logos, and custom artwork.
- Technical handover period.
- Any separately agreed support period.

Existing secrets should never be handed over. The seller should rotate them and the buyer should create replacements in its own accounts.

## Third-party and open-source rights

The buyer receives no ownership of third-party dependencies or services. The buyer must comply with each dependency's license and each provider's terms. This includes Supabase/PostgreSQL, Next.js/React/npm packages, Vercel/v0, Redis, payment providers, offerwalls, ad networks, analytics, fonts, icons, and media.

## Production obligations

The buyer is responsible for completing provider and compliance work, including Redis durability, payment tests, consent/CMP/TCF configuration, advertising approvals, privacy/legal documents, fraud controls, monitoring, backups, and authenticated browser/load testing.

## Public-history limitation

The source repository was public before being made private. Any unknown copies made during that period are outside the seller's control. The buyer should treat the transfer as exclusive against the seller, not as a guarantee that every historical third-party copy has been destroyed.

## No business-performance promise

The asset is pre-revenue. The buyer receives software and documentation, not guaranteed users, traffic, income, advertiser demand, payout liquidity, or regulatory approval.

This document is a commercial drafting aid, not legal advice. Have counsel review the transfer before payment.
