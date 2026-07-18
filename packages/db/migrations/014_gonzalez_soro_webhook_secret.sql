ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gonzalez_soro_webhook_secret TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_gonzalez_soro_webhook_secret_key
  ON tenants (gonzalez_soro_webhook_secret) WHERE gonzalez_soro_webhook_secret IS NOT NULL;
