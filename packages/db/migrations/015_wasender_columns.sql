-- Restore wasender provider column so WasenderAPI can coexist with Baileys
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS wasender_api_key text;
