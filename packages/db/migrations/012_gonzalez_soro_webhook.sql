ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS gonzalez_soro_webhook_enabled BOOLEAN NOT NULL DEFAULT false;
