-- packages/db/migrations/018_afip_invoicing.sql
-- Facturación electrónica AFIP/ARCA.
-- Ver docs/superpowers/specs/2026-08-31-facturacion-afip-design.md

-- Config del emisor, una fila por tenant.
-- cert_encrypted/key_encrypted: AES-256-GCM, formato iv:authTag:ciphertext en base64.
create table if not exists afip_config (
  tenant_id                uuid primary key references tenants(id) on delete cascade,
  cuit                     bigint not null,
  situacion_fiscal         text not null check (situacion_fiscal in ('monotributo', 'responsable_inscripto')),
  punto_venta              integer not null,
  razon_social             text not null,
  domicilio_comercial      text,
  ingresos_brutos          text,
  fecha_inicio_actividades date,
  production               boolean not null default false,
  cert_encrypted           text,
  key_encrypted            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table afip_config enable row level security;

-- Un comprobante emitido. emisor_snapshot congela los datos del emisor al
-- momento de emitir, para poder regenerar el comprobante impreso años después
-- aunque el tenant edite su configuración.
create table if not exists invoices (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id) on delete cascade,
  contact_id                uuid references contacts(id) on delete set null,
  appointment_id            uuid references appointments(id) on delete set null,
  cbte_tipo                 integer not null,
  punto_venta               integer not null,
  numero                    integer not null,
  cbte_fecha                date not null,
  concepto                  integer not null default 2,
  doc_tipo                  integer not null,
  doc_nro                   bigint not null,
  receptor_nombre           text,
  condicion_iva_receptor_id integer not null,
  detalle                   text not null,
  imp_total                 numeric(14,2) not null,
  imp_neto                  numeric(14,2) not null,
  imp_iva                   numeric(14,2) not null,
  cae                       text not null,
  cae_vto                   date not null,
  production                boolean not null,
  emisor_snapshot           jsonb not null,
  created_at                timestamptz not null default now(),
  constraint invoices_numero_uniq unique (tenant_id, punto_venta, cbte_tipo, numero)
);

create index if not exists invoices_tenant_created_idx on invoices (tenant_id, created_at desc);
create index if not exists invoices_appointment_idx on invoices (appointment_id);

alter table invoices enable row level security;

-- Ticket de acceso WSAA. Dura 12h y AFIP rechaza pedir uno nuevo mientras haya
-- uno vigente, así que no puede vivir sólo en memoria del proceso: cada redeploy
-- dejaría al tenant sin facturar hasta que expire.
create table if not exists afip_tickets (
  tenant_id    uuid not null references tenants(id) on delete cascade,
  service_name text not null,
  production   boolean not null,
  ticket_json  jsonb not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, service_name, production)
);

alter table afip_tickets enable row level security;
