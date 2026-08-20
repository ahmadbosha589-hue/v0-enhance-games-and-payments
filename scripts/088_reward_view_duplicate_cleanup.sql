-- 088: Corrective duplicate cleanup for reward-view uniqueness.
-- Migration 084 is already checksum-applied and must not be edited. This
-- forward migration preserves the earliest event by UTC day before reasserting
-- the uniqueness indexes.

DELETE FROM public.shortlink_views
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, shortlink_id, date_trunc('day', viewed_at AT TIME ZONE 'UTC')
             ORDER BY viewed_at ASC, id ASC
           ) AS row_number
    FROM public.shortlink_views
  ) ranked
  WHERE row_number > 1
);

DELETE FROM public.ptc_views
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, ad_id, date_trunc('day', created_at AT TIME ZONE 'UTC')
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM public.ptc_views
  ) ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shortlink_views_user_link_utc_day
  ON public.shortlink_views (
    user_id,
    shortlink_id,
    date_trunc('day', viewed_at AT TIME ZONE 'UTC')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptc_views_user_ad_utc_day
  ON public.ptc_views (
    user_id,
    ad_id,
    date_trunc('day', created_at AT TIME ZONE 'UTC')
  );
