-- Migration v8: Add professional_title column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS professional_title TEXT DEFAULT 'Dr.';
