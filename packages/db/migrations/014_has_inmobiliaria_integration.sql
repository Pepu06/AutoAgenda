ALTER TABLE tenants ADD COLUMN IF NOT EXISTS has_inmobiliaria_integration BOOLEAN NOT NULL DEFAULT false;
