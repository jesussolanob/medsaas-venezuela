-- Migration v4: Add reviewed_by_admin column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reviewed_by_admin BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_reviewed_by_admin
ON profiles(reviewed_by_admin)
WHERE role = 'doctor';
