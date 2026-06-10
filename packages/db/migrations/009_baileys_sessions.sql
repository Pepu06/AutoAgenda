-- packages/db/migrations/009_baileys_sessions.sql
create table if not exists baileys_sessions (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  creds_json jsonb,
  keys_json  jsonb,
  connected  boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table baileys_sessions enable row level security;
