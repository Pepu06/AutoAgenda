-- Optional note explaining why a day/slot is blocked ("vacaciones", "feriado", …).
-- Shown on the calendar next to "Día bloqueado".
ALTER TABLE schedule_exceptions
  ADD COLUMN IF NOT EXISTS reason text;
