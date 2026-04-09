-- transfer_and_calendar.sql
-- Apply in Supabase SQL Editor

-- 1. Transfer requirement per autoagenda type
ALTER TABLE autoagenda_types
  ADD COLUMN IF NOT EXISTS requires_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_instructions TEXT;

-- 2. Transfer confirmation per appointment + link to the autoagenda type that originated the booking
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS transfer_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autoagenda_type_id UUID REFERENCES autoagenda_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_autoagenda_type_id_idx ON appointments(autoagenda_type_id);

-- 3. Default Google Calendar per user (owner)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_google_calendar_id TEXT;
