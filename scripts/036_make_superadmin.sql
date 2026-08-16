-- Make a user a superadmin
-- Replace 'YOUR_EMAIL_HERE' with your actual email address

-- Option 1: By email (if you know your email)
UPDATE profiles
SET role = 'superadmin'
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE'
);

-- Option 2: By user ID (if you know your user ID)
-- UPDATE profiles
-- SET role = 'superadmin'
-- WHERE id = 'YOUR_USER_ID_HERE';

-- Option 3: Make the first user a superadmin (useful for initial setup)
-- UPDATE profiles
-- SET role = 'superadmin'
-- WHERE id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1);

-- Verify the change
SELECT id, username, display_name, role, created_at
FROM profiles
WHERE role = 'superadmin';
