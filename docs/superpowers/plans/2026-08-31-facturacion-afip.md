# Facturación electrónica AFIP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un tenant de Autoagenda cargue su certificado AFIP y emita comprobantes electrónicos (A/B/C) con CAE desde un formulario manual, con comprobante imprimible y QR.

**Architecture:** Un servicio nuevo `apps/api/src/services/afip/` con la lógica fiscal aislada en una función pura (`buildVoucher`), el SDK `@arcasdk/core` instanciado por request con el cert del tenant desencriptado en memoria, y una sola escritura en la tabla `invoices` por emisión. El comprobante se sirve como HTML imprimible generado a demanda — sin Puppeteer, sin storage.

**Tech Stack:** Node CommonJS + Express, Supabase (supabase-js REST), Next.js 15 App Router + CSS Modules, jest, `@arcasdk/core@2` (nuevo), `qrcode` (ya instalado), `crypto` de Node.

**Spec:** [docs/superpowers/specs/2026-08-31-facturacion-afip-design.md](../specs/2026-08-31-facturacion-afip-design.md)

## Global Constraints

- **Nunca lanzar `Error` pelado en controllers.** Usar las clases de `apps/api/src/errors/index.js`: `AppError(message, statusCode)`, `NotFoundError`, `ValidationError` (422), `ForbiddenError`. Regla de `CLAUDE.md`.
- **Todo query scopea por `req.tenantId`**, inyectado por `apps/api/src/middleware/auth.js`. Ningún endpoint nuevo puede leer o escribir sin ese filtro.
- **`cert` y `key` nunca se devuelven por la API, nunca se loguean, nunca se persisten en claro.** El GET de config expone solo `certConfigured: boolean`.
- **Todo el texto de cara al usuario va en español** (locale `es`), igual que el resto del producto.
- **Prohibido agregar Puppeteer** o cualquier dependencia que descargue un navegador headless. El deploy es Railway + NIXPACKS (`railway.json`).
- **La única dependencia npm nueva permitida es `@arcasdk/core`.** `qrcode@^1.5.4` ya está en `apps/api/package.json`.
- Migraciones: archivo SQL numerado en `packages/db/migrations/`, se aplican a mano en el SQL Editor de Supabase. Convención existente: SQL en minúscula, `create table if not exists`, `references tenants(id) on delete cascade`, y `enable row level security` al final.
- Tests: `cd apps/api && npm test`. Jest ya configurado, tests en `apps/api/src/__tests__/`.
- Respuestas de la API: `{ success: true, data }` en éxito, y `convertKeys()` de `@autoagenda/db` para pasar snake_case a camelCase.

## File Structure

| Archivo | Responsabilidad | Task |
|---|---|---|
| `packages/db/migrations/018_afip_invoicing.sql` | tablas `afip_config`, `invoices`, `afip_tickets` | 1 |
| `apps/api/src/utils/crypto.js` | `encrypt`/`decrypt` AES-256-GCM | 2 |
| `apps/api/src/config/env.js` | agrega `ENCRYPTION_KEY` | 2 |
| `apps/api/src/services/afip/buildVoucher.js` | **función pura**: form + config → objeto WSFE | 3 |
| `apps/api/src/services/afip/ticketStorage.js` | `ITicketStoragePort` sobre Supabase | 4 |
| `apps/api/src/services/afip/index.js` | instancia el SDK y emite | 5 |
| `apps/api/src/services/afip/comprobanteHtml.js` | fila de `invoices` → HTML imprimible + QR | 6 |
| `apps/api/src/controllers/afip.controller.js` | HTTP: config, emisión, listado, comprobante | 7 |
| `apps/api/src/routes/afip.routes.js` | routing | 7 |
| `apps/api/src/app.js` | monta `/afip` | 7 |
| `apps/api/src/__tests__/afip.buildVoucher.test.js` | tests de la lógica fiscal | 3 |
| `apps/api/src/__tests__/afip.crypto.test.js` | tests de cifrado | 2 |
| `apps/api/src/__tests__/afip.qr.test.js` | tests del payload del QR | 6 |
| `apps/web/src/app/(dashboard)/settings/` | sección "Facturación AFIP" | 8 |
| `apps/web/src/app/(dashboard)/facturacion/page.jsx` | listado de comprobantes | 9 |
| `apps/web/src/app/(dashboard)/facturacion/nueva/page.jsx` | formulario de emisión | 9 |
| `apps/web/src/app/(dashboard)/appointments/page.jsx` | botón "Facturar" | 10 |

**Orden:** las tasks 1–7 son backend y cada una deja algo verificable. 8–10 son frontend y dependen de 7.

---

### Task 1: Migración de base de datos

**Files:**
- Create: `packages/db/migrations/018_afip_invoicing.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tablas `afip_config`, `invoices`, `afip_tickets` — todos los tasks siguientes escriben/leen de acá.

- [ ] **Step 1: Escribir la migración**

Crear `packages/db/migrations/018_afip_invoicing.sql`:

```sql
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
```

- [ ] **Step 2: Verificar la sintaxis SQL**

No hay base local. Revisar a ojo contra `packages/db/migrations/009_baileys_sessions.sql`, que usa las mismas convenciones (`create table if not exists`, `references tenants(id) on delete cascade`, `enable row level security`).

Checklist:
- las tres tablas terminan en `enable row level security`
- `invoices.id` usa `gen_random_uuid()` (disponible nativo en Postgres 13+, que es lo que corre Supabase)
- el `check` de `situacion_fiscal` nombra la columna

- [ ] **Step 3: Aplicar la migración en Supabase**

Pegar el archivo entero en el SQL Editor de Supabase y ejecutar. Es el proceso documentado en `CLAUDE.md` ("apply SQL files manually in Supabase SQL Editor").

Verificar que corrió con:

```sql
select table_name from information_schema.tables
where table_name in ('afip_config','invoices','afip_tickets');
```

Esperado: 3 filas.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/018_afip_invoicing.sql
git commit -m "feat(afip): add invoicing tables"
```

---

### Task 2: Cifrado del certificado

**Files:**
- Create: `apps/api/src/utils/crypto.js`
- Create: `apps/api/src/__tests__/afip.crypto.test.js`
- Modify: `apps/api/src/config/env.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `encrypt(plaintext: string) -> string` — devuelve `iv:authTag:ciphertext`, los tres en base64
  - `decrypt(payload: string) -> string` — inversa; lanza `AppError` si el payload está corrupto o la clave no coincide
  - `env.ENCRYPTION_KEY` — string, 32 bytes en hex (64 chars) o base64

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/__tests__/afip.crypto.test.js`:

```js
/**
 * Tests for AES-256-GCM cert/key encryption at rest.
 */

// 32 bytes en hex — clave de prueba, no se usa en ningún entorno real.
process.env.ENCRYPTION_KEY = '0'.repeat(64);

const { encrypt, decrypt } = require('../utils/crypto');

describe('encrypt/decrypt', () => {
  test('round-trips a value unchanged', () => {
    const secret = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  test('produces a different ciphertext each time (random IV)', () => {
    const a = encrypt('mismo texto');
    const b = encrypt('mismo texto');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test('output has three base64 parts', () => {
    const parts = encrypt('x').split(':');
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(Buffer.from(p, 'base64').length).toBeGreaterThan(0);
    }
  });

  test('rejects a tampered ciphertext instead of returning garbage', () => {
    const [iv, tag, ct] = encrypt('secreto').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    const tampered = `${iv}:${tag}:${flipped.toString('base64')}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test('rejects a malformed payload', () => {
    expect(() => decrypt('no-tiene-formato')).toThrow();
  });

  test('accepts a base64 key as well as hex', () => {
    jest.resetModules();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const b64 = require('../utils/crypto');
    expect(b64.decrypt(b64.encrypt('hola'))).toBe('hola');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest src/__tests__/afip.crypto.test.js`
Expected: FAIL — `Cannot find module '../utils/crypto'`

- [ ] **Step 3: Implementar el módulo**

Crear `apps/api/src/utils/crypto.js`:

```js
const crypto = require('crypto');
const { AppError } = require('../errors');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // tamaño recomendado para GCM
const KEY_BYTES = 32;  // AES-256

// Se resuelve perezosamente: env.js valida la presencia, pero los tests y los
// arranques sin facturación configurada no deben explotar al importar.
let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) throw new AppError('ENCRYPTION_KEY no está configurada', 500);

  // Acepta hex (64 chars) o base64.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new AppError(`ENCRYPTION_KEY debe ser de ${KEY_BYTES} bytes (hex o base64)`, 500);
  }

  cachedKey = key;
  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':');
}

function decrypt(payload) {
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new AppError('Payload cifrado inválido', 500);

  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  // .final() lanza si el authTag no valida — ese es el punto de GCM.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest src/__tests__/afip.crypto.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Agregar `ENCRYPTION_KEY` al schema de env**

En `apps/api/src/config/env.js`, dentro de `envSchema`, después de la línea de `GMAIL_APP_PASSWORD`:

```js
  ENCRYPTION_KEY:              z.string().optional().default(''),
```

Y en el bloque `superRefine`, dentro del objeto `required` (que sólo aplica cuando `NODE_ENV === 'production'`), agregar:

```js
    ENCRYPTION_KEY: data.ENCRYPTION_KEY,
```

- [ ] **Step 6: Verificar que la API arranca**

Run: `cd apps/api && node -e "require('./src/config/env'); console.log('env ok')"`
Expected: imprime `env ok` (en desarrollo `ENCRYPTION_KEY` es opcional, así que no debe fallar).

- [ ] **Step 7: Documentar la env var**

Agregar a `.env.example`:

```
# 32 bytes en hex o base64. Cifra el certificado AFIP en reposo.
# Generar con: openssl rand -hex 32
ENCRYPTION_KEY=
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/utils/crypto.js apps/api/src/__tests__/afip.crypto.test.js apps/api/src/config/env.js .env.example
git commit -m "feat(afip): add AES-256-GCM helper for cert encryption at rest"
```

---

### Task 3: `buildVoucher` — la lógica fiscal, pura y testeada

Esta es la task con más riesgo real: acá viven todos los gotchas de AFIP. Se aísla como función pura (sin red, sin base de datos) precisamente para poder testearla entera.

**Files:**
- Create: `apps/api/src/services/afip/buildVoucher.js`
- Create: `apps/api/src/__tests__/afip.buildVoucher.test.js`

**Interfaces:**
- Consumes: `ValidationError` de `apps/api/src/errors`.
- Produces:
  - `CBTE_TIPO = { A: 1, B: 6, C: 11 }`
  - `buildVoucher(config, input) -> objeto WSFE` donde:
    - `config`: `{ puntoVenta: number, situacionFiscal: 'monotributo'|'responsable_inscripto' }`
    - `input`: `{ cbteTipo: number, total: number, receptorCuit?: string, receptorDni?: string, cbteFecha: Date, servDesde: Date, servHasta: Date, vtoPago: Date }`
    - retorno: objeto con las claves de `INextVoucher` del SDK (sin `CbteDesde`/`CbteHasta`, que los pone `createNextVoucher`)
  - `toAfipDate(date: Date) -> string` en formato `AAAAMMDD`
  - `parseAfipDate(s: string) -> string` en formato ISO `AAAA-MM-DD`, tolerando `AAAAMMDD` y `AAAA-MM-DD` de entrada

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/__tests__/afip.buildVoucher.test.js`:

```js
/**
 * Tests for AFIP voucher assembly — the fiscal rules with real gotchas:
 * the Iva array only belongs on A/B, CondicionIVAReceptorId is mandatory on all
 * three, and DocTipo depends on which receptor id we were given.
 */

const { buildVoucher, toAfipDate, parseAfipDate, CBTE_TIPO } = require('../services/afip/buildVoucher');

const MONOTRIBUTO = { puntoVenta: 3, situacionFiscal: 'monotributo' };
const INSCRIPTO   = { puntoVenta: 3, situacionFiscal: 'responsable_inscripto' };

function baseInput(overrides = {}) {
  return {
    cbteTipo: CBTE_TIPO.C,
    total: 121,
    cbteFecha: new Date('2026-08-31T12:00:00Z'),
    servDesde: new Date('2026-08-31T12:00:00Z'),
    servHasta: new Date('2026-08-31T12:00:00Z'),
    vtoPago:   new Date('2026-08-31T12:00:00Z'),
    ...overrides,
  };
}

describe('toAfipDate / parseAfipDate', () => {
  test('formats a date as AAAAMMDD', () => {
    expect(toAfipDate(new Date('2026-08-31T12:00:00Z'))).toBe('20260831');
  });

  test('zero-pads single-digit months and days', () => {
    expect(toAfipDate(new Date('2026-01-05T12:00:00Z'))).toBe('20260105');
  });

  // El formato de CAEFchVto no es estable entre versiones del SDK.
  test('parses AAAAMMDD', () => {
    expect(parseAfipDate('20260910')).toBe('2026-09-10');
  });

  test('parses AAAA-MM-DD unchanged', () => {
    expect(parseAfipDate('2026-09-10')).toBe('2026-09-10');
  });

  test('rejects an unrecognized date format', () => {
    expect(() => parseAfipDate('10/09/2026')).toThrow();
  });
});

describe('factura C (monotributo)', () => {
  test('carries no Iva array and no VAT', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput({ total: 121 }));
    expect(v).not.toHaveProperty('Iva');
    expect(v.ImpNeto).toBe(121);
    expect(v.ImpIVA).toBe(0);
    expect(v.ImpTotal).toBe(121);
  });

  test('defaults to consumidor final', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.DocTipo).toBe(99);
    expect(v.DocNro).toBe(0);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('uses DocTipo 96 when a DNI is given', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput({ receptorDni: '30111222' }));
    expect(v.DocTipo).toBe(96);
    expect(v.DocNro).toBe(30111222);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('rejects a monotributista trying to issue an A', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ cbteTipo: CBTE_TIPO.A })))
      .toThrow(/monotributo/i);
  });
});

describe('factura A (responsable inscripto)', () => {
  test('breaks out 21% VAT and includes the Iva array', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({
      cbteTipo: CBTE_TIPO.A, total: 121, receptorCuit: '30111111118',
    }));
    expect(v.ImpNeto).toBe(100);
    expect(v.ImpIVA).toBe(21);
    expect(v.Iva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
  });

  test('maps a CUIT receptor to DocTipo 80 / responsable inscripto', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({
      cbteTipo: CBTE_TIPO.A, receptorCuit: '30111111118',
    }));
    expect(v.DocTipo).toBe(80);
    expect(v.DocNro).toBe(30111111118);
    expect(v.CondicionIVAReceptorId).toBe(1);
  });

  test('requires a CUIT — an A to consumidor final is not a thing', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.A })))
      .toThrow(/CUIT/i);
  });

  test('rejects a malformed CUIT', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.A, receptorCuit: '123' })))
      .toThrow(/CUIT/i);
  });

  test('net plus VAT always equals the total', () => {
    for (const total of [100, 121, 1500.5, 33.33, 0.03]) {
      const v = buildVoucher(INSCRIPTO, baseInput({
        cbteTipo: CBTE_TIPO.A, total, receptorCuit: '30111111118',
      }));
      expect(v.ImpNeto + v.ImpIVA).toBeCloseTo(v.ImpTotal, 2);
    }
  });
});

describe('factura B (responsable inscripto a consumidor final)', () => {
  test('breaks out VAT but stays consumidor final', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.B, total: 121 }));
    expect(v.Iva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
    expect(v.DocTipo).toBe(99);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('accepts an optional DNI', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.B, receptorDni: '30111222' }));
    expect(v.DocTipo).toBe(96);
    expect(v.DocNro).toBe(30111222);
  });

  test('rejects a B from a monotributista', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ cbteTipo: CBTE_TIPO.B })))
      .toThrow(/monotributo/i);
  });
});

describe('campos comunes', () => {
  test('always sets Concepto 2 with the three service dates', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.Concepto).toBe(2);
    expect(v.FchServDesde).toBe('20260831');
    expect(v.FchServHasta).toBe('20260831');
    expect(v.FchVtoPago).toBe('20260831');
  });

  test('sets the fixed WSFE fields', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.CantReg).toBe(1);
    expect(v.PtoVta).toBe(3);
    expect(v.MonId).toBe('PES');
    expect(v.MonCotiz).toBe(1);
    expect(v.ImpTotConc).toBe(0);
    expect(v.ImpOpEx).toBe(0);
    expect(v.ImpTrib).toBe(0);
  });

  test('leaves numbering to createNextVoucher', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v).not.toHaveProperty('CbteDesde');
    expect(v).not.toHaveProperty('CbteHasta');
  });

  test('rejects a non-positive total', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ total: 0 }))).toThrow(/monto/i);
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ total: -5 }))).toThrow(/monto/i);
  });

  test('rejects an unknown voucher type', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: 99 }))).toThrow();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest src/__tests__/afip.buildVoucher.test.js`
Expected: FAIL — `Cannot find module '../services/afip/buildVoucher'`

- [ ] **Step 3: Implementar `buildVoucher`**

Crear `apps/api/src/services/afip/buildVoucher.js`:

```js
const { ValidationError } = require('../../errors');

// Tipos de comprobante WSFE. Sólo facturas: las notas de crédito/débito
// (2/3, 7/8, 12/13) no tienen flujo todavía.
const CBTE_TIPO = { A: 1, B: 6, C: 11 };

// Documento del receptor.
const DOC_TIPO = { CUIT: 80, DNI: 96, SIN_IDENTIFICAR: 99 };

// Condición frente al IVA del receptor. Obligatorio desde la RG 5616: sin este
// campo AFIP rechaza el comprobante, sea A, B o C.
const COND_IVA = { RESPONSABLE_INSCRIPTO: 1, CONSUMIDOR_FINAL: 5 };

const IVA_21_ID = 5;   // id de alícuota 21% en la tabla de AFIP
const CONCEPTO_SERVICIOS = 2;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toAfipDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// El formato de CAEFchVto no es estable entre versiones del SDK, así que
// aceptamos las dos formas y normalizamos a ISO para guardar en Postgres.
function parseAfipDate(value) {
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  throw new ValidationError(`Fecha de AFIP con formato inesperado: ${s}`);
}

function assertTipoPermitido(situacionFiscal, cbteTipo) {
  if (situacionFiscal === 'monotributo' && cbteTipo !== CBTE_TIPO.C) {
    throw new ValidationError('Un monotributo sólo puede emitir factura C.');
  }
  if (situacionFiscal === 'responsable_inscripto' && cbteTipo === CBTE_TIPO.C) {
    throw new ValidationError('Un responsable inscripto emite factura A o B, no C.');
  }
  if (![CBTE_TIPO.A, CBTE_TIPO.B, CBTE_TIPO.C].includes(cbteTipo)) {
    throw new ValidationError(`Tipo de comprobante no soportado: ${cbteTipo}`);
  }
}

// Devuelve { DocTipo, DocNro, CondicionIVAReceptorId } según el tipo y los datos
// del receptor. La A exige CUIT; B y C caen en consumidor final si no hay DNI.
function buildReceptor(cbteTipo, { receptorCuit, receptorDni }) {
  if (cbteTipo === CBTE_TIPO.A) {
    const cuit = String(receptorCuit || '').replace(/\D/g, '');
    if (!/^\d{11}$/.test(cuit)) {
      throw new ValidationError('La factura A requiere el CUIT del receptor (11 dígitos).');
    }
    return {
      DocTipo: DOC_TIPO.CUIT,
      DocNro: Number(cuit),
      CondicionIVAReceptorId: COND_IVA.RESPONSABLE_INSCRIPTO,
    };
  }

  const dni = String(receptorDni || '').replace(/\D/g, '');
  if (dni) {
    return {
      DocTipo: DOC_TIPO.DNI,
      DocNro: Number(dni),
      CondicionIVAReceptorId: COND_IVA.CONSUMIDOR_FINAL,
    };
  }

  // AFIP exige identificar al receptor en facturas B por encima de cierto monto,
  // pero ese umbral cambia por resolución. No lo hardcodeamos: si el monto lo
  // supera, AFIP rechaza y el mensaje se le muestra al usuario tal cual.
  return {
    DocTipo: DOC_TIPO.SIN_IDENTIFICAR,
    DocNro: 0,
    CondicionIVAReceptorId: COND_IVA.CONSUMIDOR_FINAL,
  };
}

// La C no discrimina IVA. Mandar el array Iva en una C — o omitirlo en una A/B
// con importe > 0 — devuelve el error 10070 de AFIP.
function buildImportes(cbteTipo, total) {
  if (cbteTipo === CBTE_TIPO.C) {
    return { ImpNeto: total, ImpIVA: 0 };
  }
  const neto = round2(total / 1.21);
  // El IVA sale por resta y no por multiplicación, para que neto + iva dé
  // exactamente el total y AFIP no rechace por diferencia de un centavo.
  const iva = round2(total - neto);
  return {
    ImpNeto: neto,
    ImpIVA: iva,
    Iva: [{ Id: IVA_21_ID, BaseImp: neto, Importe: iva }],
  };
}

/**
 * Arma el objeto WSFE para createNextVoucher. Función pura: sin red, sin base
 * de datos. CbteDesde/CbteHasta los completa createNextVoucher.
 */
function buildVoucher(config, input) {
  const { cbteTipo, total, cbteFecha, servDesde, servHasta, vtoPago } = input;

  assertTipoPermitido(config.situacionFiscal, cbteTipo);

  const importe = round2(Number(total));
  if (!Number.isFinite(importe) || importe <= 0) {
    throw new ValidationError('El monto debe ser mayor a cero.');
  }

  const receptor = buildReceptor(cbteTipo, input);
  const importes = buildImportes(cbteTipo, importe);

  return {
    CantReg: 1,
    PtoVta: config.puntoVenta,
    CbteTipo: cbteTipo,
    Concepto: CONCEPTO_SERVICIOS,
    ...receptor,
    CbteFch: toAfipDate(cbteFecha),
    ImpTotal: importe,
    ImpTotConc: 0,
    ImpOpEx: 0,
    ImpTrib: 0,
    ...importes,
    // Concepto 2 (servicios) obliga a informar el período y el vencimiento.
    FchServDesde: toAfipDate(servDesde),
    FchServHasta: toAfipDate(servHasta),
    FchVtoPago: toAfipDate(vtoPago),
    MonId: 'PES',
    MonCotiz: 1,
  };
}

module.exports = { buildVoucher, toAfipDate, parseAfipDate, CBTE_TIPO, DOC_TIPO, COND_IVA };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest src/__tests__/afip.buildVoucher.test.js`
Expected: PASS, todos los tests.

Si el test de `ImpNeto + ImpIVA === ImpTotal` falla en algún monto, el bug está en `buildImportes` — el IVA tiene que salir por resta (`total - neto`), nunca por `neto * 0.21`.

- [ ] **Step 5: Correr la suite entera para no romper nada**

Run: `cd apps/api && npm test`
Expected: PASS, incluyendo los tests que ya existían.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/afip/buildVoucher.js apps/api/src/__tests__/afip.buildVoucher.test.js
git commit -m "feat(afip): add pure voucher builder with A/B/C fiscal rules"
```

---

### Task 4: Persistencia del ticket WSAA

Sin esto, cada redeploy de Railway deja al tenant sin poder facturar por hasta 12 horas: AFIP rechaza pedir un ticket nuevo mientras el anterior siga vigente, y el anterior vivía en la memoria del proceso que se acaba de reiniciar.

**Files:**
- Create: `apps/api/src/services/afip/ticketStorage.js`

**Interfaces:**
- Consumes: `supabase` de `@autoagenda/db`; tabla `afip_tickets` (Task 1).
- Produces: `createTicketStorage({ tenantId, production, AccessTicket }) -> ITicketStoragePort` — objeto con `save(ticket, serviceName)`, `get(serviceName)`, `delete(serviceName)`. `AccessTicket` se inyecta desde `index.js` para no importar el SDK acá.

- [ ] **Step 1: Implementar el storage**

Crear `apps/api/src/services/afip/ticketStorage.js`:

```js
const { supabase } = require('@autoagenda/db');
const logger = require('../../config/logger');

/**
 * ITicketStoragePort de @arcasdk/core respaldado en Supabase.
 *
 * El ticket de acceso WSAA dura 12 horas y AFIP rechaza emitir uno nuevo
 * mientras haya uno vigente. El MemoryTicketStorage que trae el SDK lo guarda
 * en un Map del proceso, así que cada redeploy lo pierde y deja al tenant sin
 * facturar hasta que el ticket viejo expire. Persistirlo evita eso.
 *
 * Se serializa igual que MemoryTicketStorage: { header, credentials }.
 */
function createTicketStorage({ tenantId, production, AccessTicket }) {
  return {
    async save(ticket, serviceName) {
      const ticketJson = {
        header: ticket.getHeaders(),
        credentials: ticket.getCredentials(),
      };

      const { error } = await supabase
        .from('afip_tickets')
        .upsert({
          tenant_id: tenantId,
          service_name: String(serviceName),
          production,
          ticket_json: ticketJson,
          expires_at: ticket.getExpiration().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,service_name,production' });

      if (error) {
        // No es fatal: sin ticket guardado el SDK pide uno nuevo. Se loguea
        // para poder correlacionar si aparecen rechazos de WSAA.
        logger.warn({ err: error.message, tenantId }, 'afip_ticket_save_failed');
      }
    },

    async get(serviceName) {
      const { data, error } = await supabase
        .from('afip_tickets')
        .select('ticket_json')
        .eq('tenant_id', tenantId)
        .eq('service_name', String(serviceName))
        .eq('production', production)
        .maybeSingle();

      if (error || !data) return null;

      try {
        const ticket = AccessTicket.create(data.ticket_json);
        // Un ticket vencido es peor que ninguno: el SDK lo usaría y AFIP
        // devolvería un error de autenticación en vez de renovarlo.
        return ticket.isExpired() ? null : ticket;
      } catch (err) {
        logger.warn({ err: err.message, tenantId }, 'afip_ticket_parse_failed');
        return null;
      }
    },

    async delete(serviceName) {
      await supabase
        .from('afip_tickets')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('service_name', String(serviceName))
        .eq('production', production);
    },
  };
}

module.exports = { createTicketStorage };
```

- [ ] **Step 2: Verificar que el módulo carga**

Run: `cd apps/api && node -e "console.log(typeof require('./src/services/afip/ticketStorage').createTicketStorage)"`
Expected: imprime `function`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/afip/ticketStorage.js
git commit -m "feat(afip): persist WSAA ticket in Supabase so redeploys don't lock out billing"
```

---

### Task 5: Servicio de emisión

**Files:**
- Create: `apps/api/src/services/afip/index.js`
- Modify: `apps/api/package.json` (agrega `@arcasdk/core`)

**Interfaces:**
- Consumes: `buildVoucher`, `parseAfipDate`, `CBTE_TIPO` (Task 3); `createTicketStorage` (Task 4); `decrypt` (Task 2).
- Produces:
  - `emitirComprobante(config, input) -> { cae, caeVto, numero, voucher }` donde `config` es la fila de `afip_config` en camelCase con `cert`/`key` **ya desencriptados**, `input` es lo mismo que recibe `buildVoucher`, `caeVto` sale en ISO `AAAA-MM-DD`, y `numero` es el número asignado por AFIP.

- [ ] **Step 1: Instalar el SDK**

Run: `cd apps/api && npm install @arcasdk/core@^2.0.0`

- [ ] **Step 2: Verificar que no entró Puppeteer**

Run: `grep -c '"node_modules/puppeteer"' package-lock.json`
Expected: `0`

Si da distinto de 0, parar: algo trajo un navegador headless y eso rompe el build de Railway. Revisar qué se instaló antes de seguir.

- [ ] **Step 3: Implementar el servicio**

Crear `apps/api/src/services/afip/index.js`:

```js
const { Arca, AccessTicket } = require('@arcasdk/core');
const { buildVoucher, parseAfipDate, CBTE_TIPO } = require('./buildVoucher');
const { createTicketStorage } = require('./ticketStorage');
const { AppError, ValidationError } = require('../../errors');
const logger = require('../../config/logger');

// El paquete es CommonJS (salida de tsc), así que un require normal alcanza.
// La instancia igual se arma por request y no al bootear: depende del
// certificado del tenant, que sólo existe desencriptado en memoria y por el
// tiempo que dura la emisión.
function getArcaInstance(config) {
  if (!config.cuit) throw new ValidationError('Falta el CUIT del emisor.');
  if (!config.cert || !config.key) {
    throw new ValidationError('Falta cargar el certificado y la clave de AFIP.');
  }

  return new Arca({
    cuit: Number(config.cuit),
    cert: config.cert,
    key: config.key,
    production: Boolean(config.production),
    ticketStorage: createTicketStorage({
      tenantId: config.tenantId,
      production: Boolean(config.production),
      AccessTicket,
    }),
  });
}

// El SDK NO lanza excepción cuando AFIP rechaza: devuelve cae: "" y deja el
// detalle en response.Errors.Err y en Observaciones.Obs. Sin este chequeo
// guardaríamos una factura con CAE vacío y le diríamos al usuario que se emitió.
function assertAceptado(result) {
  if (result?.cae) return;

  const det = result?.response?.FeDetResp?.FECAEDetResponse?.[0];
  const mensajes = [
    ...(result?.response?.Errors?.Err ?? []),
    ...(det?.Observaciones?.Obs ?? []),
  ]
    .map((e) => `${e.Code}: ${e.Msg}`)
    .filter(Boolean);

  const detalle = mensajes.length ? mensajes.join(' | ') : 'sin detalle';
  throw new AppError(`AFIP rechazó el comprobante — ${detalle}`, 400);
}

/**
 * Emite un comprobante y devuelve el CAE. No escribe en la base: eso es
 * responsabilidad del controller, que hace un solo INSERT en invoices.
 *
 * ponytail: createNextVoucher hace getLastVoucher+1 internamente y esa secuencia
 * no es atómica del lado de AFIP. Dos emisiones simultáneas sobre el mismo punto
 * de venta pueden pedir el mismo número; AFIP rechaza la segunda (error 10016)
 * sin duplicar CAE ni corromper nada, y el usuario reintenta. Si esto llegara a
 * ser un problema real (varios operadores facturando a la vez), el upgrade es un
 * lock distribuido en Redis — ioredis ya está disponible vía BullMQ.
 */
async function emitirComprobante(config, input) {
  const voucher = buildVoucher(config, input);
  const arca = getArcaInstance(config);

  const result = await arca.electronicBillingService.createNextVoucher(voucher);
  assertAceptado(result);

  const numero = result?.response?.FeDetResp?.FECAEDetResponse?.[0]?.CbteDesde;
  if (!numero) {
    throw new AppError('AFIP no devolvió el número de comprobante.', 502);
  }

  return {
    cae: result.cae,
    caeVto: parseAfipDate(result.caeFchVto),
    numero: Number(numero),
    voucher,
  };
}

module.exports = { emitirComprobante, getArcaInstance, CBTE_TIPO, logger };
```

- [ ] **Step 4: Verificar que el módulo carga y el SDK es requerible**

Run: `cd apps/api && node -e "const s=require('./src/services/afip'); console.log(typeof s.emitirComprobante)"`
Expected: imprime `function` sin errores de import.

Si tira `ERR_REQUIRE_ESM`, el paquete cambió a ESM entre versiones: en ese caso pasar a `await import('@arcasdk/core')` dentro de `getArcaInstance` y hacer la función `async`.

- [ ] **Step 5: Correr la suite para confirmar que nada se rompió**

Run: `cd apps/api && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

Desde la raíz del repo (el lockfile es del workspace, no de `apps/api`):

```bash
git add apps/api/package.json package-lock.json apps/api/src/services/afip/index.js
git commit -m "feat(afip): add voucher emission service on @arcasdk/core"
```

---

### Task 6: Comprobante imprimible con QR

**Files:**
- Create: `apps/api/src/services/afip/comprobanteHtml.js`
- Create: `apps/api/src/__tests__/afip.qr.test.js`

**Interfaces:**
- Consumes: `qrcode` (ya instalado); fila de `invoices` (Task 1).
- Produces:
  - `buildQrPayload(invoice) -> object` con los campos exactos que documenta AFIP
  - `buildQrUrl(invoice) -> string` — `https://www.afip.gob.ar/fe/qr/?p=<base64>`
  - `renderComprobante(invoice) -> Promise<string>` — HTML completo, listo para imprimir

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/__tests__/afip.qr.test.js`:

```js
/**
 * Tests for the AFIP verification QR. The payload shape is fixed by AFIP —
 * a wrong field name makes the QR resolve to nothing on their site.
 */

const { buildQrPayload, buildQrUrl } = require('../services/afip/comprobanteHtml');

const INVOICE = {
  cbteFecha: '2026-08-31',
  cbteTipo: 11,
  puntoVenta: 3,
  numero: 152,
  docTipo: 96,
  docNro: 30111222,
  impTotal: '1210.50',
  cae: '74512345678901',
  emisorSnapshot: { cuit: 20111111112, razonSocial: 'Mi Negocio' },
};

describe('buildQrPayload', () => {
  test('carries exactly the fields AFIP documents', () => {
    expect(buildQrPayload(INVOICE)).toEqual({
      ver: 1,
      fecha: '2026-08-31',
      cuit: 20111111112,
      ptoVta: 3,
      tipoCmp: 11,
      nroCmp: 152,
      importe: 1210.5,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 96,
      nroDocRec: 30111222,
      tipoCodAut: 'E',
      codAut: 74512345678901,
    });
  });

  test('sends the amount as a number, not a string', () => {
    expect(typeof buildQrPayload(INVOICE).importe).toBe('number');
  });

  test('sends the CAE as a number', () => {
    expect(buildQrPayload(INVOICE).codAut).toBe(74512345678901);
  });
});

describe('buildQrUrl', () => {
  test('points at the AFIP verification endpoint', () => {
    expect(buildQrUrl(INVOICE)).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
  });

  test('base64 payload decodes back to the original JSON', () => {
    const b64 = buildQrUrl(INVOICE).split('?p=')[1];
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(decoded).toEqual(buildQrPayload(INVOICE));
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest src/__tests__/afip.qr.test.js`
Expected: FAIL — `Cannot find module '../services/afip/comprobanteHtml'`

- [ ] **Step 3: Implementar el renderer**

Crear `apps/api/src/services/afip/comprobanteHtml.js`:

```js
const QRCode = require('qrcode');

const LETRA = { 1: 'A', 6: 'B', 11: 'C' };
const NOMBRE_TIPO = { 1: 'FACTURA A', 6: 'FACTURA B', 11: 'FACTURA C' };
const NOMBRE_DOC = { 80: 'CUIT', 96: 'DNI', 99: 'Consumidor Final' };
const NOMBRE_COND_IVA = { 1: 'IVA Responsable Inscripto', 5: 'Consumidor Final' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatMoney(value) {
  return Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Payload del QR de verificación, con el formato que fija AFIP (RG 4892).
 * Los nombres de campo no son negociables: si uno cambia, el QR no resuelve.
 */
function buildQrPayload(invoice) {
  return {
    ver: 1,
    fecha: String(invoice.cbteFecha).slice(0, 10),
    cuit: Number(invoice.emisorSnapshot.cuit),
    ptoVta: Number(invoice.puntoVenta),
    tipoCmp: Number(invoice.cbteTipo),
    nroCmp: Number(invoice.numero),
    importe: Number(invoice.impTotal),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(invoice.docTipo),
    nroDocRec: Number(invoice.docNro),
    tipoCodAut: 'E',
    codAut: Number(invoice.cae),
  };
}

function buildQrUrl(invoice) {
  const payload = Buffer.from(JSON.stringify(buildQrPayload(invoice))).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${payload}`;
}

/**
 * Comprobante como página HTML imprimible. No se genera un PDF en el servidor
 * a propósito: cualquier renderer HTML->PDF trae un Chromium, que rompe el
 * build de Railway. El usuario hace "Imprimir -> Guardar como PDF" desde el
 * navegador. AFIP regula qué tiene que contener el comprobante, no el formato
 * de archivo con el que se entrega.
 */
async function renderComprobante(invoice) {
  const qrDataUri = await QRCode.toDataURL(buildQrUrl(invoice), { margin: 1, width: 200 });
  const emisor = invoice.emisorSnapshot;
  const letra = LETRA[invoice.cbteTipo] || '';
  const esC = invoice.cbteTipo === 11;
  const numeroFormateado = `${String(invoice.puntoVenta).padStart(5, '0')}-${String(invoice.numero).padStart(8, '0')}`;
  const receptorDoc = invoice.docTipo === 99
    ? 'Consumidor Final'
    : `${NOMBRE_DOC[invoice.docTipo] || 'Doc'}: ${invoice.docNro}`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(NOMBRE_TIPO[invoice.cbteTipo])} ${escapeHtml(numeroFormateado)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111;
         background: #f4f4f5; margin: 0; padding: 24px; }
  .hoja { max-width: 780px; margin: 0 auto; background: #fff; padding: 32px;
          border: 1px solid #d4d4d8; }
  .encabezado { display: flex; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .emisor, .comprobante { flex: 1; }
  .comprobante { text-align: right; }
  .letra { display: inline-block; border: 2px solid #111; font-size: 40px;
           font-weight: 700; width: 64px; text-align: center; line-height: 1.1; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .dato { font-size: 13px; color: #3f3f46; margin: 2px 0; }
  .seccion { margin-top: 24px; }
  .seccion h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
                color: #71717a; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; background: #f4f4f5; padding: 8px; font-size: 12px;
       text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 10px 8px; border-bottom: 1px solid #e4e4e7; }
  .num { text-align: right; }
  .totales { margin-top: 16px; margin-left: auto; width: 280px; font-size: 14px; }
  .totales div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totales .total { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px;
                    font-size: 18px; font-weight: 700; }
  .pie { margin-top: 32px; display: flex; gap: 24px; align-items: center;
         border-top: 1px solid #e4e4e7; padding-top: 16px; }
  .pie img { width: 120px; height: 120px; }
  .cae { font-size: 14px; }
  .cae strong { font-size: 18px; letter-spacing: .04em; }
  .acciones { max-width: 780px; margin: 0 auto 16px; }
  button { font: inherit; padding: 10px 18px; border: 1px solid #111; background: #111;
           color: #fff; border-radius: 6px; cursor: pointer; }
  @media print {
    body { background: #fff; padding: 0; }
    .hoja { border: 0; padding: 0; max-width: none; }
    .acciones { display: none; }
  }
</style>
</head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
  <div class="hoja">
    <div class="encabezado">
      <div class="emisor">
        <h1>${escapeHtml(emisor.razonSocial)}</h1>
        <p class="dato">${escapeHtml(emisor.domicilioComercial || '')}</p>
        <p class="dato">CUIT: ${escapeHtml(emisor.cuit)}</p>
        ${emisor.ingresosBrutos ? `<p class="dato">Ingresos Brutos: ${escapeHtml(emisor.ingresosBrutos)}</p>` : ''}
        ${emisor.fechaInicioActividades ? `<p class="dato">Inicio de actividades: ${escapeHtml(formatDate(emisor.fechaInicioActividades))}</p>` : ''}
      </div>
      <div class="comprobante">
        <div class="letra">${escapeHtml(letra)}</div>
        <h1>${escapeHtml(NOMBRE_TIPO[invoice.cbteTipo])}</h1>
        <p class="dato">N° ${escapeHtml(numeroFormateado)}</p>
        <p class="dato">Fecha: ${escapeHtml(formatDate(invoice.cbteFecha))}</p>
      </div>
    </div>

    <div class="seccion">
      <h2>Receptor</h2>
      <p class="dato">${escapeHtml(invoice.receptorNombre || 'Consumidor Final')}</p>
      <p class="dato">${escapeHtml(receptorDoc)}</p>
      <p class="dato">Condición frente al IVA: ${escapeHtml(NOMBRE_COND_IVA[invoice.condicionIvaReceptorId] || '-')}</p>
    </div>

    <div class="seccion">
      <h2>Detalle</h2>
      <table>
        <thead><tr><th>Concepto</th><th class="num">Importe</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(invoice.detalle)}</td>
            <td class="num">$ ${escapeHtml(formatMoney(invoice.impTotal))}</td>
          </tr>
        </tbody>
      </table>

      <div class="totales">
        ${esC ? '' : `
        <div><span>Neto gravado</span><span>$ ${escapeHtml(formatMoney(invoice.impNeto))}</span></div>
        <div><span>IVA 21%</span><span>$ ${escapeHtml(formatMoney(invoice.impIva))}</span></div>`}
        <div class="total"><span>Total</span><span>$ ${escapeHtml(formatMoney(invoice.impTotal))}</span></div>
      </div>
    </div>

    <div class="pie">
      <img src="${qrDataUri}" alt="Código QR de verificación AFIP">
      <div class="cae">
        <p class="dato">CAE N°</p>
        <p><strong>${escapeHtml(invoice.cae)}</strong></p>
        <p class="dato">Vencimiento del CAE: ${escapeHtml(formatDate(invoice.caeVto))}</p>
        ${invoice.production ? '' : '<p class="dato"><strong>COMPROBANTE EMITIDO EN AMBIENTE DE PRUEBA — SIN VALIDEZ FISCAL</strong></p>'}
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderComprobante, buildQrPayload, buildQrUrl };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest src/__tests__/afip.qr.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Inspeccionar el HTML a ojo**

Run:

```bash
cd apps/api && node -e "
const { renderComprobante } = require('./src/services/afip/comprobanteHtml');
renderComprobante({
  cbteFecha: '2026-08-31', cbteTipo: 11, puntoVenta: 3, numero: 152,
  docTipo: 96, docNro: 30111222, receptorNombre: 'Juan Pérez',
  condicionIvaReceptorId: 5, detalle: 'Sesión de coaching',
  impTotal: '15000.00', impNeto: '15000.00', impIva: '0.00',
  cae: '74512345678901', caeVto: '2026-09-10', production: false,
  emisorSnapshot: { cuit: 20111111112, razonSocial: 'Mi Negocio',
    domicilioComercial: 'Av. Corrientes 1234', ingresosBrutos: '12-3456789-0',
    fechaInicioActividades: '2018-03-01' },
}).then((html) => require('fs').writeFileSync('/tmp/comprobante.html', html));
"
```

Abrir `/tmp/comprobante.html` en el navegador. Verificar: el QR se ve, la letra C está en el recuadro, el aviso de "ambiente de prueba" aparece, y no hay bloque de IVA (es una C). Probar "Imprimir" y confirmar que el botón desaparece en la vista previa.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/afip/comprobanteHtml.js apps/api/src/__tests__/afip.qr.test.js
git commit -m "feat(afip): render printable comprobante with verification QR"
```

---

### Task 7: Endpoints de la API

**Files:**
- Create: `apps/api/src/controllers/afip.controller.js`
- Create: `apps/api/src/routes/afip.routes.js`
- Modify: `apps/api/src/app.js`

**Interfaces:**
- Consumes: `emitirComprobante` (Task 5), `renderComprobante` (Task 6), `encrypt`/`decrypt` (Task 2), `CBTE_TIPO` (Task 3).
- Produces los endpoints que consume el frontend (Tasks 8–10):
  - `GET /afip/config` → `{ success, data: { configured, certConfigured, cuit, situacionFiscal, puntoVenta, razonSocial, domicilioComercial, ingresosBrutos, fechaInicioActividades, production } }`
  - `PUT /afip/config` → `{ success, data }` (mismo shape)
  - `GET /afip/invoices?appointmentId=&limit=&offset=` → `{ success, data: Invoice[] }`
  - `POST /afip/invoices` → `{ success, data: Invoice }`
  - `GET /afip/invoices/:id/comprobante` → `text/html`

- [ ] **Step 1: Implementar el controller**

Crear `apps/api/src/controllers/afip.controller.js`:

```js
const { supabase, convertKeys } = require('@autoagenda/db');
const { AppError, ValidationError, NotFoundError } = require('../errors');
const { encrypt, decrypt } = require('../utils/crypto');
const { emitirComprobante } = require('../services/afip');
const { CBTE_TIPO } = require('../services/afip/buildVoucher');
const { renderComprobante } = require('../services/afip/comprobanteHtml');
const logger = require('../config/logger');

// Campos de configuración que el cliente puede escribir. cert/key quedan fuera
// a propósito: se manejan aparte porque van cifrados.
const CONFIG_FIELDS = [
  'cuit', 'situacion_fiscal', 'punto_venta', 'razon_social',
  'domicilio_comercial', 'ingresos_brutos', 'fecha_inicio_actividades', 'production',
];

const CONFIG_SELECT = `tenant_id, ${CONFIG_FIELDS.join(', ')}, cert_encrypted, key_encrypted`;

// El certificado nunca sale de la API. El cliente sólo sabe si está cargado.
function stripCert(row) {
  const data = convertKeys(row);
  data.certConfigured = Boolean(data.certEncrypted && data.keyEncrypted);
  delete data.certEncrypted;
  delete data.keyEncrypted;
  return data;
}

async function getConfig(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('afip_config')
      .select(CONFIG_SELECT)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.json({ success: true, data: { configured: false, certConfigured: false } });
    }

    return res.json({ success: true, data: { ...stripCert(data), configured: true } });
  } catch (err) { return next(err); }
}

async function updateConfig(req, res, next) {
  try {
    const updates = {};
    for (const field of CONFIG_FIELDS) {
      const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (camel in req.body) updates[field] = req.body[camel];
    }

    if (updates.cuit !== undefined) {
      const cuit = String(updates.cuit).replace(/\D/g, '');
      if (!/^\d{11}$/.test(cuit)) throw new ValidationError('El CUIT debe tener 11 dígitos.');
      updates.cuit = Number(cuit);
    }

    if (updates.situacion_fiscal !== undefined
        && !['monotributo', 'responsable_inscripto'].includes(updates.situacion_fiscal)) {
      throw new ValidationError('Situación fiscal inválida.');
    }

    if (updates.punto_venta !== undefined) {
      const pv = Number(updates.punto_venta);
      if (!Number.isInteger(pv) || pv <= 0) throw new ValidationError('Punto de venta inválido.');
      updates.punto_venta = pv;
    }

    // cert/key llegan sólo cuando el usuario los carga o los reemplaza.
    if (req.body.cert) updates.cert_encrypted = encrypt(req.body.cert);
    if (req.body.key) updates.key_encrypted = encrypt(req.body.key);

    if (!Object.keys(updates).length) throw new AppError('No hay campos para actualizar.', 400);

    updates.tenant_id = req.tenantId;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('afip_config')
      .upsert(updates, { onConflict: 'tenant_id' })
      .select(CONFIG_SELECT)
      .single();

    if (error) throw error;
    return res.json({ success: true, data: { ...stripCert(data), configured: true } });
  } catch (err) { return next(err); }
}

// Carga la config y desencripta cert/key en memoria. El resultado no se
// persiste ni se loguea en ningún caso.
async function loadEmisor(tenantId) {
  const { data, error } = await supabase
    .from('afip_config')
    .select(CONFIG_SELECT)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ValidationError('Configurá primero los datos de AFIP en Ajustes.');
  if (!data.cert_encrypted || !data.key_encrypted) {
    throw new ValidationError('Falta cargar el certificado de AFIP en Ajustes.');
  }

  return {
    tenantId,
    cuit: data.cuit,
    situacionFiscal: data.situacion_fiscal,
    puntoVenta: data.punto_venta,
    production: data.production,
    razonSocial: data.razon_social,
    domicilioComercial: data.domicilio_comercial,
    ingresosBrutos: data.ingresos_brutos,
    fechaInicioActividades: data.fecha_inicio_actividades,
    cert: decrypt(data.cert_encrypted),
    key: decrypt(data.key_encrypted),
  };
}

function parseFecha(value, fallback) {
  if (!value) return fallback;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Fecha inválida: ${value}`);
  return d;
}

async function listInvoices(req, res, next) {
  try {
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (req.query.appointmentId) query = query.eq('appointment_id', req.query.appointmentId);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, data: convertKeys(data || []) });
  } catch (err) { return next(err); }
}

async function createInvoice(req, res, next) {
  try {
    const b = req.body || {};

    const cbteTipo = Number(b.cbteTipo);
    if (![CBTE_TIPO.A, CBTE_TIPO.B, CBTE_TIPO.C].includes(cbteTipo)) {
      throw new ValidationError('Tipo de comprobante inválido.');
    }

    const total = Number(b.total);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ValidationError('El monto debe ser mayor a cero.');
    }

    const detalle = String(b.detalle || '').trim();
    if (!detalle) throw new ValidationError('Cargá un detalle para el comprobante.');

    const emisor = await loadEmisor(req.tenantId);

    const hoy = new Date();
    const input = {
      cbteTipo,
      total,
      receptorCuit: b.receptorCuit,
      receptorDni: b.receptorDni,
      cbteFecha: parseFecha(b.cbteFecha, hoy),
      servDesde: parseFecha(b.servDesde, hoy),
      servHasta: parseFecha(b.servHasta, hoy),
      vtoPago:   parseFecha(b.vtoPago, hoy),
    };

    const { cae, caeVto, numero, voucher } = await emitirComprobante(emisor, input);

    const row = {
      tenant_id: req.tenantId,
      contact_id: b.contactId || null,
      appointment_id: b.appointmentId || null,
      cbte_tipo: cbteTipo,
      punto_venta: emisor.puntoVenta,
      numero,
      cbte_fecha: voucher.CbteFch.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      concepto: voucher.Concepto,
      doc_tipo: voucher.DocTipo,
      doc_nro: voucher.DocNro,
      receptor_nombre: b.receptorNombre || null,
      condicion_iva_receptor_id: voucher.CondicionIVAReceptorId,
      detalle,
      imp_total: voucher.ImpTotal,
      imp_neto: voucher.ImpNeto,
      imp_iva: voucher.ImpIVA,
      cae,
      cae_vto: caeVto,
      production: emisor.production,
      // Congela los datos del emisor para poder reimprimir el comprobante tal
      // como salió, aunque después edite su configuración.
      emisor_snapshot: {
        cuit: emisor.cuit,
        razonSocial: emisor.razonSocial,
        domicilioComercial: emisor.domicilioComercial,
        ingresosBrutos: emisor.ingresosBrutos,
        fechaInicioActividades: emisor.fechaInicioActividades,
      },
    };

    const { data, error } = await supabase.from('invoices').insert(row).select().single();

    if (error) {
      // El CAE ya existe del lado de AFIP: el comprobante está emitido aunque no
      // lo hayamos podido guardar. Se loguea entero para poder recuperarlo a mano.
      logger.error({
        err: error.message, tenantId: req.tenantId,
        cae, caeVto, numero, puntoVenta: emisor.puntoVenta, cbteTipo,
      }, 'afip_invoice_persist_failed_after_cae');
      throw new AppError(
        `El comprobante se emitió en AFIP (CAE ${cae}) pero no se pudo guardar. Contactá a soporte con ese número.`,
        500,
      );
    }

    return res.status(201).json({ success: true, data: convertKeys(data) });
  } catch (err) { return next(err); }
}

async function getComprobante(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundError('Comprobante no encontrado');

    const html = await renderComprobante(convertKeys(data));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(html);
  } catch (err) { return next(err); }
}

module.exports = { getConfig, updateConfig, listInvoices, createInvoice, getComprobante };
```

- [ ] **Step 2: Implementar las rutas**

Crear `apps/api/src/routes/afip.routes.js`:

```js
const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  getConfig, updateConfig, listInvoices, createInvoice, getComprobante,
} = require('../controllers/afip.controller');

const router = Router();
router.use(auth);

router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/invoices', listInvoices);
router.post('/invoices', createInvoice);
router.get('/invoices/:id/comprobante', getComprobante);

module.exports = router;
```

- [ ] **Step 3: Montar las rutas**

En `apps/api/src/app.js`, junto a las otras líneas `app.use(...)` del final (después de `app.use('/integrations', ...)`):

```js
app.use('/afip', require('./routes/afip.routes'));
```

- [ ] **Step 4: Verificar que la API arranca**

Run: `cd apps/api && node -e "require('./src/app'); console.log('app ok')"`
Expected: imprime `app ok`

- [ ] **Step 5: Verificar que los endpoints exigen auth**

Levantar la API (`cd apps/api && npm run dev`) y en otra terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/afip/config
```

Expected: `401`

- [ ] **Step 6: Probar el flujo de config con un token real**

Loguearse desde la UI, copiar el token de `localStorage`, y:

```bash
TOKEN=<pegar-token-aca>
curl -s http://localhost:3001/afip/config -H "Authorization: Bearer $TOKEN"
```

Expected: `{"success":true,"data":{"configured":false,"certConfigured":false}}`

Después guardar una config de prueba:

```bash
curl -s -X PUT http://localhost:3001/afip/config \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cuit":"20111111112","situacionFiscal":"monotributo","puntoVenta":3,"razonSocial":"Mi Negocio","production":false}'
```

Expected: `success: true`, `configured: true`, `certConfigured: false`, y **ninguna** clave `certEncrypted` o `keyEncrypted` en la respuesta.

- [ ] **Step 7: Correr la suite entera**

Run: `cd apps/api && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/controllers/afip.controller.js apps/api/src/routes/afip.routes.js apps/api/src/app.js
git commit -m "feat(afip): add config and invoice emission endpoints"
```

---

### Task 8: Configuración del emisor en Ajustes

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.jsx`
- Modify: `apps/web/src/app/(dashboard)/settings/settings.module.css`

**Interfaces:**
- Consumes: `GET /afip/config`, `PUT /afip/config` (Task 7); el cliente `api` de `apps/web/src/lib/api.js`.
- Produces: nada para otras tasks.

- [ ] **Step 1: Leer la página de ajustes actual**

Leer `apps/web/src/app/(dashboard)/settings/page.jsx` entero antes de tocar nada. Identificar cómo están armadas las secciones existentes (headings, estado, handler de submit, clases de CSS Modules) y **seguir ese mismo patrón** — no introducir uno nuevo.

- [ ] **Step 2: Agregar el estado de la config AFIP**

En el componente de settings, junto a los otros `useState`:

```jsx
const [afip, setAfip] = useState(null);
const [afipSaving, setAfipSaving] = useState(false);
const [afipError, setAfipError] = useState('');
const [afipOk, setAfipOk] = useState('');
```

En el `useEffect` que ya carga los ajustes, sumar la carga de la config AFIP:

```jsx
api.get('/afip/config')
  .then((res) => setAfip(res.data))
  .catch(() => setAfip({ configured: false, certConfigured: false }));
```

- [ ] **Step 3: Agregar el handler de guardado**

```jsx
async function handleAfipSave(e) {
  e.preventDefault();
  setAfipSaving(true);
  setAfipError('');
  setAfipOk('');

  const form = new FormData(e.currentTarget);
  const body = {
    cuit: form.get('cuit'),
    situacionFiscal: form.get('situacionFiscal'),
    puntoVenta: Number(form.get('puntoVenta')),
    razonSocial: form.get('razonSocial'),
    domicilioComercial: form.get('domicilioComercial'),
    ingresosBrutos: form.get('ingresosBrutos'),
    fechaInicioActividades: form.get('fechaInicioActividades') || null,
    production: form.get('production') === 'on',
  };

  // Sólo se mandan si el usuario los pegó ahora: si los deja vacíos, se
  // conservan los que ya están guardados.
  const cert = String(form.get('cert') || '').trim();
  const key = String(form.get('key') || '').trim();
  if (cert) body.cert = cert;
  if (key) body.key = key;

  try {
    const res = await api.put('/afip/config', body);
    setAfip(res.data);
    setAfipOk('Configuración de AFIP guardada.');
    e.target.querySelector('[name="cert"]').value = '';
    e.target.querySelector('[name="key"]').value = '';
  } catch (err) {
    setAfipError(err.message);
  } finally {
    setAfipSaving(false);
  }
}
```

- [ ] **Step 4: Agregar la sección al JSX**

Insertar como una sección más de la página, usando las clases de CSS Modules que ya usan las otras secciones:

```jsx
<section className={styles.section}>
  <h2>Facturación AFIP</h2>
  <p className={styles.hint}>
    Cargá tus datos fiscales y el certificado de AFIP para poder emitir facturas
    electrónicas. El certificado se guarda cifrado y nunca se muestra de nuevo.
  </p>

  {afip && (
    <form onSubmit={handleAfipSave}>
      <label>CUIT
        <input name="cuit" defaultValue={afip.cuit || ''} placeholder="20111111112" required />
      </label>

      <label>Situación fiscal
        <select name="situacionFiscal" defaultValue={afip.situacionFiscal || 'monotributo'} required>
          <option value="monotributo">Monotributo</option>
          <option value="responsable_inscripto">Responsable Inscripto</option>
        </select>
      </label>

      <label>Punto de venta
        <input name="puntoVenta" type="number" min="1" defaultValue={afip.puntoVenta || ''} required />
      </label>

      <label>Razón social
        <input name="razonSocial" defaultValue={afip.razonSocial || ''} required />
      </label>

      <label>Domicilio comercial
        <input name="domicilioComercial" defaultValue={afip.domicilioComercial || ''} />
      </label>

      <label>Ingresos brutos
        <input name="ingresosBrutos" defaultValue={afip.ingresosBrutos || ''} />
      </label>

      <label>Inicio de actividades
        <input name="fechaInicioActividades" type="date"
               defaultValue={afip.fechaInicioActividades?.slice(0, 10) || ''} />
      </label>

      <label>
        <input name="production" type="checkbox" defaultChecked={Boolean(afip.production)} />
        Emitir en producción (sin tildar, se usa el ambiente de prueba de AFIP)
      </label>

      <p className={styles.hint}>
        Certificado: {afip.certConfigured ? 'configurado ✓' : 'no configurado'}
        {afip.certConfigured && ' — pegá uno nuevo abajo sólo si querés reemplazarlo.'}
      </p>

      <label>Certificado (.crt)
        <textarea name="cert" rows={4} placeholder="-----BEGIN CERTIFICATE-----" />
      </label>

      <label>Clave privada (.key)
        <textarea name="key" rows={4} placeholder="-----BEGIN PRIVATE KEY-----" />
      </label>

      {afipError && <p className={styles.error}>{afipError}</p>}
      {afipOk && <p className={styles.success}>{afipOk}</p>}

      <button type="submit" disabled={afipSaving}>
        {afipSaving ? 'Guardando…' : 'Guardar configuración de AFIP'}
      </button>
    </form>
  )}
</section>
```

Si `styles.error` / `styles.success` / `styles.hint` no existen en `settings.module.css`, usar las clases equivalentes que la página ya tenga para esos estados. Si no hay ninguna, agregarlas siguiendo el estilo del archivo.

- [ ] **Step 5: Verificar en el navegador**

Levantar el frontend (`cd apps/web && npm run dev`), entrar a Ajustes y comprobar:

1. La sección "Facturación AFIP" aparece y carga sin errores en consola.
2. Guardar datos sin certificado → dice "Certificado: no configurado".
3. Pegar cualquier texto en los dos textarea y guardar → pasa a "configurado ✓", y los textarea quedan vacíos.
4. Recargar la página → los datos persisten y el certificado **no** vuelve en la respuesta (verificar en la pestaña Network que el GET `/afip/config` no trae `certEncrypted`).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/"
git commit -m "feat(afip): add issuer configuration section to settings"
```

---

### Task 9: Pantalla de facturación

**Files:**
- Create: `apps/web/src/app/(dashboard)/facturacion/page.jsx`
- Create: `apps/web/src/app/(dashboard)/facturacion/facturacion.module.css`
- Create: `apps/web/src/app/(dashboard)/facturacion/nueva/page.jsx`
- Create: `apps/web/src/app/(dashboard)/facturacion/nueva/nueva.module.css`
- Modify: el archivo de navegación del dashboard (buscarlo con `grep -rn "contacts" apps/web/src/app/\(dashboard\)/layout.jsx apps/web/src/components 2>/dev/null`)

La ruta es `facturacion`, **no** `billing`: `(dashboard)/billing` ya es la suscripción del tenant a RecordAI y no tiene nada que ver con esto.

**Interfaces:**
- Consumes: `GET /afip/invoices`, `POST /afip/invoices`, `GET /afip/config` (Task 7); `GET /contacts`; `GET /appointments/:id` para la precarga.
- Produces: la ruta `/facturacion/nueva?appointmentId=<id>`, que usa Task 10.

- [ ] **Step 1: Leer una página existente como referencia**

Leer `apps/web/src/app/(dashboard)/contacts/page.jsx` y su `.module.css`. Copiar el patrón: `'use client'`, carga con `useEffect` + `api.get`, estados de loading y error, y las clases del CSS Module.

- [ ] **Step 2: Crear el listado**

Crear `apps/web/src/app/(dashboard)/facturacion/page.jsx`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import styles from './facturacion.module.css';

const NOMBRE_TIPO = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function formatMoney(value) {
  return Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
}

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function FacturacionPage() {
  const [invoices, setInvoices] = useState([]);
  const [afipConfigured, setAfipConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/afip/invoices'), api.get('/afip/config')])
      .then(([inv, cfg]) => {
        setInvoices(inv.data || []);
        setAfipConfigured(Boolean(cfg.data?.certConfigured));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // El comprobante se pide con el header Authorization y se escribe en una
  // pestaña nueva. No se navega directo a la URL porque eso obligaría a mandar
  // el token por query string, y auth.js sólo lo permite en el stream SSE del
  // QR justamente para que no se filtre a logs y Referer.
  // La ventana se abre ANTES del await: si se abriera después, el bloqueador de
  // popups la descartaría por no venir de un gesto directo del usuario.
  async function abrirComprobante(id) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<p style="font-family:sans-serif">Generando comprobante…</p>');

    try {
      const res = await fetch(`${API_URL}/afip/invoices/${id}/comprobante`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('No se pudo generar el comprobante');
      const html = await res.text();
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      win.document.body.textContent = err.message;
    }
  }

  if (loading) return <p className={styles.state}>Cargando…</p>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Facturación</h1>
        <Link href="/facturacion/nueva" className={styles.primary}>Nueva factura</Link>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {!afipConfigured && (
        <p className={styles.warning}>
          Todavía no cargaste el certificado de AFIP.{' '}
          <Link href="/settings">Configurarlo en Ajustes</Link>
        </p>
      )}

      {invoices.length === 0 ? (
        <p className={styles.state}>Todavía no emitiste ninguna factura.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th><th>Tipo</th><th>Número</th><th>Receptor</th>
              <th className={styles.num}>Total</th><th>CAE</th><th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{formatDate(inv.cbteFecha)}</td>
                <td>
                  {NOMBRE_TIPO[inv.cbteTipo]}
                  {!inv.production && <span className={styles.badge}>prueba</span>}
                </td>
                <td>
                  {String(inv.puntoVenta).padStart(5, '0')}-{String(inv.numero).padStart(8, '0')}
                </td>
                <td>{inv.receptorNombre || 'Consumidor Final'}</td>
                <td className={styles.num}>{formatMoney(inv.impTotal)}</td>
                <td>{inv.cae}</td>
                <td>
                  <button type="button" onClick={() => abrirComprobante(inv.id)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Confirmar que `auth.js` NO se toca**

`apps/api/src/middleware/auth.js:10-13` sólo acepta el token por query string en
`/baileys/qr`, con un comentario que explica por qué: *"Query-string tokens leak
into logs/Referer"*. Esa excepción **no se amplía** — por eso el paso anterior
pide el comprobante con `fetch` + header y lo escribe en la ventana nueva.

Verificar que el archivo quedó intacto:

```bash
git diff --quiet apps/api/src/middleware/auth.js && echo "auth.js intacto"
```

Expected: imprime `auth.js intacto`

- [ ] **Step 4: Crear el CSS del listado**

Crear `apps/web/src/app/(dashboard)/facturacion/facturacion.module.css` siguiendo las convenciones de `contacts.module.css` (leerlo primero y reusar variables de color y espaciado). Debe cubrir: `.page`, `.header`, `.primary`, `.table`, `.num`, `.badge`, `.state`, `.error`, `.warning`.

- [ ] **Step 5: Crear el formulario de emisión**

Crear `apps/web/src/app/(dashboard)/facturacion/nueva/page.jsx`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import styles from './nueva.module.css';

const CBTE = { A: 1, B: 6, C: 11 };

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function NuevaFacturaPage() {
  const router = useRouter();
  const params = useSearchParams();
  const appointmentId = params.get('appointmentId');

  const [config, setConfig] = useState(null);
  const [cbteTipo, setCbteTipo] = useState(null);
  const [prefill, setPrefill] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/afip/config')
      .then((res) => {
        setConfig(res.data);
        // Un monotributo sólo puede emitir C: no tiene sentido preguntarle.
        if (res.data.situacionFiscal === 'monotributo') setCbteTipo(CBTE.C);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!appointmentId) return;
    api.get(`/appointments/${appointmentId}`)
      .then((res) => {
        const a = res.data;
        setPrefill({
          contactId: a.contact?.id,
          receptorNombre: a.contact?.name || '',
          receptorDni: a.contact?.dni || '',
          detalle: a.service?.name || '',
          total: a.service?.price || '',
          fecha: String(a.scheduledAt || '').slice(0, 10) || hoyIso(),
        });
      })
      .catch(() => { /* la precarga es una comodidad: si falla, se carga a mano */ });
  }, [appointmentId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const body = {
      cbteTipo,
      total: Number(form.get('total')),
      detalle: String(form.get('detalle') || '').trim(),
      receptorNombre: form.get('receptorNombre') || null,
      receptorDni: form.get('receptorDni') || null,
      receptorCuit: form.get('receptorCuit') || null,
      cbteFecha: form.get('cbteFecha'),
      servDesde: form.get('servDesde'),
      servHasta: form.get('servHasta'),
      vtoPago: form.get('vtoPago'),
      contactId: prefill.contactId || null,
      appointmentId: appointmentId || null,
    };

    try {
      await api.post('/afip/invoices', body);
      router.push('/facturacion');
    } catch (err) {
      // Los mensajes de AFIP son accionables ("punto de venta no habilitado"),
      // así que se muestran tal cual vienen.
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (!config) return <p className={styles.state}>Cargando…</p>;

  if (!config.certConfigured) {
    return (
      <main className={styles.page}>
        <h1>Nueva factura</h1>
        <p className={styles.warning}>
          Antes de facturar tenés que cargar tu certificado de AFIP en Ajustes.
        </p>
      </main>
    );
  }

  const esInscripto = config.situacionFiscal === 'responsable_inscripto';

  // Paso 1: elegir el tipo. Un monotributo se lo saltea (ya quedó fijado en C).
  if (!cbteTipo) {
    return (
      <main className={styles.page}>
        <h1>Nueva factura</h1>
        <p>¿Qué comprobante querés emitir?</p>
        <div className={styles.tipos}>
          <button type="button" onClick={() => setCbteTipo(CBTE.A)}>
            <strong>Factura A</strong>
            <span>A un responsable inscripto. Requiere su CUIT.</span>
          </button>
          <button type="button" onClick={() => setCbteTipo(CBTE.B)}>
            <strong>Factura B</strong>
            <span>A consumidor final o exento. El DNI es opcional.</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1>Nueva factura {cbteTipo === CBTE.A ? 'A' : cbteTipo === CBTE.B ? 'B' : 'C'}</h1>

      {esInscripto && (
        <button type="button" className={styles.link} onClick={() => setCbteTipo(null)}>
          ← Cambiar tipo de comprobante
        </button>
      )}

      {!config.production && (
        <p className={styles.warning}>
          Ambiente de prueba: el comprobante no tiene validez fiscal.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <label>Nombre del receptor
          <input name="receptorNombre" defaultValue={prefill.receptorNombre || ''} />
        </label>

        {cbteTipo === CBTE.A ? (
          <label>CUIT del receptor
            <input name="receptorCuit" placeholder="30111111118" required />
          </label>
        ) : (
          <label>DNI del receptor (opcional)
            <input name="receptorDni" defaultValue={prefill.receptorDni || ''} />
          </label>
        )}

        <label>Detalle
          <input name="detalle" defaultValue={prefill.detalle || ''}
                 placeholder="Sesión de coaching" required />
        </label>

        <label>Monto total (IVA incluido)
          <input name="total" type="number" step="0.01" min="0.01"
                 defaultValue={prefill.total || ''} required />
        </label>

        <label>Fecha del comprobante
          <input name="cbteFecha" type="date" defaultValue={prefill.fecha || hoyIso()} required />
        </label>

        <fieldset>
          <legend>Período del servicio</legend>
          <label>Desde
            <input name="servDesde" type="date" defaultValue={prefill.fecha || hoyIso()} required />
          </label>
          <label>Hasta
            <input name="servHasta" type="date" defaultValue={prefill.fecha || hoyIso()} required />
          </label>
          <label>Vencimiento de pago
            <input name="vtoPago" type="date" defaultValue={hoyIso()} required />
          </label>
        </fieldset>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Emitiendo…' : 'Emitir factura'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Crear el CSS del formulario**

Crear `apps/web/src/app/(dashboard)/facturacion/nueva/nueva.module.css` con: `.page`, `.tipos`, `.link`, `.state`, `.error`, `.warning`. Seguir las convenciones del CSS Module de la página de contactos.

- [ ] **Step 7: Agregar "Facturación" a la navegación**

Localizar el archivo de navegación:

```bash
grep -rn "contacts" "apps/web/src/app/(dashboard)/layout.jsx" apps/web/src/components 2>/dev/null | head
```

Agregar el link a `/facturacion` con la etiqueta "Facturación", copiando la forma exacta de los items que ya están.

- [ ] **Step 8: Verificar el flujo entero en el navegador**

Con la API y el frontend levantados y una config AFIP de homologación cargada (certificado de prueba de AFIP):

1. Ir a `/facturacion` → carga sin errores, muestra el estado vacío.
2. "Nueva factura" → si el tenant es responsable inscripto, aparece la elección A/B; si es monotributo, va directo al formulario de C.
3. Emitir una factura de prueba → redirige al listado y aparece la fila con su CAE.
4. "Ver" → abre el comprobante en una pestaña nueva, con el QR visible y el aviso de ambiente de prueba.
5. Escanear el QR con el celular → debería abrir el sitio de AFIP (en homologación va a decir que el comprobante no existe en producción; eso es lo esperado).

Si AFIP rechaza, el mensaje de error tiene que verse tal cual en el formulario, con el código y el texto de AFIP.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/(dashboard)/facturacion/" "apps/web/src/app/(dashboard)/layout.jsx"
git commit -m "feat(afip): add invoicing screens and issue form"
```

---

### Task 10: Botón "Facturar" desde el turno

**Files:**
- Modify: `apps/web/src/app/(dashboard)/appointments/page.jsx`

**Interfaces:**
- Consumes: la ruta `/facturacion/nueva?appointmentId=<id>` (Task 9); `GET /afip/invoices?appointmentId=<id>` (Task 7).
- Produces: nada.

- [ ] **Step 1: Leer la página de turnos**

Leer `apps/web/src/app/(dashboard)/appointments/page.jsx` entero. Ubicar dónde se renderizan las acciones de cada turno (los botones de Confirmar/Cancelar) — el botón nuevo va ahí.

- [ ] **Step 2: Cargar qué turnos ya tienen factura**

En el `useEffect` que carga los turnos, sumar una consulta al listado de facturas y armar un set de `appointmentId` facturados:

```jsx
const [facturados, setFacturados] = useState(new Set());

useEffect(() => {
  api.get('/afip/invoices?limit=200')
    .then((res) => {
      setFacturados(new Set((res.data || []).map((i) => i.appointmentId).filter(Boolean)));
    })
    // Si el tenant no tiene facturación configurada esto falla, y está bien:
    // simplemente no se muestra ningún badge.
    .catch(() => {});
}, []);
```

- [ ] **Step 3: Agregar el botón y el badge**

Junto a las otras acciones del turno:

```jsx
{facturados.has(appointment.id) ? (
  <span className={styles.badgeFacturado}>Facturado ✓</span>
) : (
  <Link href={`/facturacion/nueva?appointmentId=${appointment.id}`}>Facturar</Link>
)}
```

Si `Link` no está importado en el archivo, agregar `import Link from 'next/link';`.

- [ ] **Step 4: Agregar el estilo del badge**

En `apps/web/src/app/(dashboard)/appointments/appointments.module.css`, agregar `.badgeFacturado` siguiendo el estilo de los badges de estado que ya existan en ese archivo.

- [ ] **Step 5: Verificar en el navegador**

1. Un turno sin factura muestra el link "Facturar".
2. Clickearlo lleva a `/facturacion/nueva?appointmentId=...` con contacto, DNI, detalle y monto precargados desde el turno y su servicio.
3. Emitir la factura y volver a Turnos → ese turno ahora muestra "Facturado ✓".

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/appointments/"
git commit -m "feat(afip): add invoice action to appointment rows"
```

---

## Verificación final

- [ ] `cd apps/api && npm test` → todos los tests pasan
- [ ] `npm run lint` desde la raíz → sin errores nuevos
- [ ] `grep -c '"node_modules/puppeteer"' package-lock.json` → `0`
- [ ] `git grep -n "certEncrypted\|keyEncrypted" apps/web/` → sin resultados (el certificado nunca llega al cliente)
- [ ] Emitir un comprobante de homologación de punta a punta y abrir su HTML
- [ ] Reiniciar la API y emitir otro comprobante sin esperar → tiene que funcionar (prueba de que el ticket WSAA persistido hace su trabajo)
