-- TuAutoAgenda migration
-- Apply in Supabase SQL Editor

-- 1. Extend tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS autoagenda_title TEXT,
  ADD COLUMN IF NOT EXISTS autoagenda_description TEXT,
  ADD COLUMN IF NOT EXISTS autoagenda_profile_image TEXT,
  ADD COLUMN IF NOT EXISTS autoagenda_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Schedules (Horarios laborales)
CREATE TABLE IF NOT EXISTS schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS schedules_tenant_id_idx ON schedules(tenant_id);

-- 3. Schedule rules (bloques semanales, varios por día)
CREATE TABLE IF NOT EXISTS schedule_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS schedule_rules_schedule_id_idx ON schedule_rules(schedule_id);

-- 4. Schedule exceptions (overrides por fecha)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  is_blocked  BOOLEAN NOT NULL DEFAULT TRUE,
  start_time  TEXT,
  end_time    TEXT,
  UNIQUE(schedule_id, date)
);
CREATE INDEX IF NOT EXISTS schedule_exceptions_schedule_id_idx ON schedule_exceptions(schedule_id);

-- 5. Autoagenda types (tipos de cita reservables)
CREATE TABLE IF NOT EXISTS autoagenda_types (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id               UUID REFERENCES services(id),
  schedule_id              UUID NOT NULL REFERENCES schedules(id),
  title                    TEXT NOT NULL,
  description              TEXT,
  duration_minutes         INT NOT NULL DEFAULT 30,
  google_calendar_id       TEXT,
  min_hours_before_booking INT NOT NULL DEFAULT 0,
  max_days_in_future       INT,
  max_concurrent_bookings  INT NOT NULL DEFAULT 1,
  extra_questions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS autoagenda_types_tenant_id_idx ON autoagenda_types(tenant_id);
