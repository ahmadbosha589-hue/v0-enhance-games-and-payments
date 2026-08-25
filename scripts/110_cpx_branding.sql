-- 110: Align offerwall_providers branding with the static registry.
-- CPX Research now has real brand logos at /offerwalls/cpx-research/.
-- Idempotent: safe to re-run.

UPDATE public.offerwall_providers
SET logo_url = '/offerwalls/cpx-research/logo-light.png'
WHERE slug = 'cpx-research'
  AND (logo_url IS NULL OR logo_url <> '/offerwalls/cpx-research/logo-light.png');
