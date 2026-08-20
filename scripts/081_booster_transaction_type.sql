-- Add the transaction type used by atomic booster purchases.
-- This is a forward-compatible enum extension; existing values are unchanged.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'booster_purchase';
