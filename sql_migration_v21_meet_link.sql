-- Migration v21: Add Google Meet link and Google Calendar event ID to appointments
-- Run this in Supabase SQL Editor

-- Add meet_link column to store Google Meet URL for online consultations
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meet_link TEXT;

-- Add google_event_id to track the Google Calendar event
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- Add index for quick lookup by google_event_id
CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id ON appointments(google_event_id) WHERE google_event_id IS NOT NULL;
