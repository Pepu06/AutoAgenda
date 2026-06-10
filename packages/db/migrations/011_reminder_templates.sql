-- Add configurable message templates to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS reminder_template TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_template TEXT;
