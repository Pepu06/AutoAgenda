-- RecordAI Schema — run this in Supabase SQL Editor
-- Project: yxrypsdybldauzwtkphq

-- Enums
CREATE TYPE user_role          AS ENUM ('owner', 'staff');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE message_direction  AS ENUM ('inbound', 'outbound');
CREATE TYPE message_type       AS ENUM ('confirmation', 'reminder', 'follow_up', 'reply');
CREATE TYPE message_status     AS ENUM ('sent', 'delivered', 'read', 'failed');

-- Tenants
CREATE TABLE tenants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  slug                      TEXT UNIQUE NOT NULL,
  plan                      TEXT NOT NULL DEFAULT 'free',
  whatsapp_phone_number_id  TEXT,
  whatsapp_access_token     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role          user_role NOT NULL DEFAULT 'staff',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON users(tenant_id);

-- Contacts
CREATE TABLE contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON contacts(tenant_id);

-- Services
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price            DECIMAL NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON services(tenant_id);

-- Appointments
CREATE TABLE appointments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id           UUID NOT NULL REFERENCES contacts(id),
  service_id           UUID NOT NULL REFERENCES services(id),
  user_id              UUID NOT NULL REFERENCES users(id),
  scheduled_at         TIMESTAMPTZ NOT NULL,
  status               appointment_status NOT NULL DEFAULT 'pending',
  notes                TEXT,
  reminder_sent_at     TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON appointments(tenant_id);
CREATE INDEX ON appointments(tenant_id, scheduled_at);
CREATE INDEX ON appointments(tenant_id, status);

-- Availability rules
CREATE TABLE availability_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  day_of_week INTEGER NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON availability_rules(tenant_id);

-- Message logs
CREATE TABLE message_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  type           message_type NOT NULL,
  direction      message_direction NOT NULL DEFAULT 'outbound',
  status         message_status NOT NULL DEFAULT 'sent',
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wa_message_id  TEXT
);
CREATE INDEX ON message_logs(tenant_id);
CREATE INDEX ON message_logs(appointment_id);

-- Auto-update updated_at on appointments
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
