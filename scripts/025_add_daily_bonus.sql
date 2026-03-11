-- Add daily bonus tracking column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMPTZ DEFAULT NULL;

-- Add daily bonus amount columns for tracking
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS total_daily_bonuses INT DEFAULT 0;

-- Create index for efficient daily bonus queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_daily_bonus_at ON profiles(last_daily_bonus_at);

-- Comment on new columns
COMMENT ON COLUMN profiles.last_daily_bonus_at IS 'Timestamp of last daily bonus claim';
COMMENT ON COLUMN profiles.total_daily_bonuses IS 'Total number of daily bonuses claimed';
