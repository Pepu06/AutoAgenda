# Facturación electrónica AFIP/ARCA en Autoagenda

Fecha: 2026-08-31
Estado: diseño aprobado, pendiente plan de implementación

## Problema

Autoagenda no tiene ningún concepto de cobro registrado: no hay tabla de pagos,
no hay estado "pagado" en `appointments`, y `services.price` es un precio de
referencia que no representa lo efectivamente cobrado. Es decir, **no existe un
evento de dominio del cual derivar el monto de una factura**.

Conclusión: la factura no se puede generar automáticamente a partir de un turno.
Nace de un **formulario manual** donde el usuario carga el monto cada vez. El
turno, cuando existe, solo sirve para precargar datos (contacto, DNI, detalle
sugerido, monto sugerido) — todos editables.

## SDK elegido: `@arcasdk/core`

El prompt de referencia proponía `@afipsdk/afip.js`. Se reemplaza por
[`@arcasdk/core`](https://www.afipts.com/) por tres razones concretas:

| | `@afipsdk/afip.js` | `@arcasdk/core` |
|---|---|---|
| Cuenta de terceros | requiere `access_token` de afipsdk.com | habla directo con ARCA, no requiere nada |
| Numeración | `getLastVoucher` + `createVoucher` a mano | `createNextVoucher` lo hace en un paso |

Consecuencias del cambio respecto del prompt original:

- **Se elimina la env var `AFIP_ACCESS_TOKEN`** y el gotcha #6 del prompt.
- **Ya no aplica el truco del CUIT de prueba sin certificado.** `@arcasdk/core`
  necesita certificado de homologación también en testing. El usuario carga
  cert+key antes de poder facturar, en cualquiera de los dos modos.
- Es un paquete TypeScript/ESM y el repo es CommonJS → se carga con
  `await import()` perezoso dentro de la función de emisión (mismo patrón que ya
  proponía el prompt).

Sus dependencias son livianas y verificadas: `node-forge`, `soap`, `std-env`,
`xml2js`. Nada de binarios pesados.

### `@arcasdk/pdf` queda descartado

El paquete complementario que arma el PDF con diseño oficial y QR **no se usa**.
Verificado con `npm view @arcasdk/pdf dependencies`: trae `puppeteer: ^24.43.1`
como dependencia directa. Este repo deploya en **Railway con NIXPACKS**
(`railway.json`) y hoy no tiene Puppeteer en el lockfile — sumarlo implica
descargar Chromium en cada build, que es exactamente el problema que ya obligó
a sacar Puppeteer del proyecto de referencia (Inmoo).

El comprobante se resuelve sin él — ver la sección "Comprobante imprimible".

### Almacenamiento del ticket WSAA (no es opcional)

AFIP emite tickets de acceso (TA) válidos por 12 horas y **rechaza pedir uno
nuevo mientras haya uno vigente** (`El CEE ya posee un TA valido...`). Con el
ticket en memoria del proceso, cada redeploy de la API deja el TA vigente
inaccesible y rompe la facturación por hasta 12 horas.

`@arcasdk/core` expone `ticketStorage` (`ITicketStoragePort`) para esto. Se
implementa una versión respaldada en Supabase (tabla `afip_tickets`, clave
tenant + servicio). No es gold-plating: sin esto el sistema se rompe en cada
deploy.

## Modelo de datos

### `afip_config` — un registro por tenant

```
tenant_id                 uuid primary key references tenants(id) on delete cascade
cuit                      bigint not null
situacion_fiscal          text not null check (in ('monotributo','responsable_inscripto'))
punto_venta               integer not null
razon_social              text not null
domicilio_comercial       text
ingresos_brutos           text
fecha_inicio_actividades  date
production                boolean not null default false
cert_encrypted            text
key_encrypted             text
created_at / updated_at   timestamptz
```

`cert_encrypted` / `key_encrypted`: AES-256-GCM con `ENCRYPTION_KEY`. Nunca en
texto plano, nunca logueados, **nunca devueltos por la API** — el GET informa
solo `certConfigured: true|false`, siguiendo el patrón que ya usa
`gonzalez_soro_webhook_secret` en [settings.controller.js](apps/api/src/controllers/settings.controller.js).

### `invoices` — una fila por comprobante emitido

```
id                        uuid primary key default gen_random_uuid()
tenant_id                 uuid not null references tenants(id) on delete cascade
contact_id                uuid references contacts(id) on delete set null
appointment_id            uuid references appointments(id) on delete set null
cbte_tipo                 integer not null      -- 1|6|11
punto_venta               integer not null
numero                    integer not null
cbte_fecha                date not null
concepto                  integer not null default 2   -- servicios
doc_tipo                  integer not null      -- 80 CUIT | 96 DNI | 99 sin id
doc_nro                   bigint not null
receptor_nombre           text
condicion_iva_receptor_id integer not null
detalle                   text not null
imp_total                 numeric(14,2) not null
imp_neto                  numeric(14,2) not null
imp_iva                   numeric(14,2) not null
cae                       text not null
cae_vto                   date not null
production                boolean not null
emisor_snapshot           jsonb not null
created_at                timestamptz not null default now()

unique (tenant_id, punto_venta, cbte_tipo, numero)
```

`emisor_snapshot` congela razón social / domicilio / IIBB / CUIT / inicio de
actividades al momento de emitir. Permite regenerar el PDF años después con los
datos que efectivamente salieron impresos, aunque el tenant después edite su
configuración.

### Lo que NO se agrega

**No hay columna espejo `invoice_id` en `appointments`.** La relación ya está
modelada por `invoices.appointment_id`; el badge "Facturado ✓" en un turno es un
lookup. El prompt original mismo marca esas columnas espejo como una
optimización de lectura específica del otro sistema.

Esto tiene una consecuencia de diseño importante: **la emisión es una sola
escritura**, un `INSERT` en `invoices`. No hay dos escrituras que puedan quedar
desincronizadas, así que **no hace falta la transacción atómica de la sección 4
del prompt** — que además no sería directa con `supabase-js`, que es REST y no
tiene `BEGIN/COMMIT` (habría requerido una función Postgres vía `.rpc()`).

Riesgo residual y su mitigación: si `createNextVoucher` responde con CAE pero el
`INSERT` falla, queda un comprobante emitido en AFIP e invisible para nosotros.
Se mitiga logueando el CAE completo a nivel `error` antes de propagar la
excepción, para recuperación manual (y `getVoucherInfo` permite reconciliar).

## Flujo de emisión

### Paso 1 — Tipo de comprobante

Las opciones dependen de `situacion_fiscal` del tenant:

- **monotributo** → solo **C** (11). No se muestra selector.
- **responsable_inscripto** → elige **A** (1) o **B** (6).

### Paso 2 — Datos del receptor, según el tipo elegido

| Tipo | Receptor | `DocTipo` | `CondicionIVAReceptorId` | Desglose IVA |
|---|---|---|---|---|
| A (1) | CUIT **obligatorio** + razón social | 80 | 1 (RI) | sí |
| B (6) | DNI opcional, si no → Consumidor Final | 96 / 99 | 5 (CF) | sí |
| C (11) | DNI opcional, si no → Consumidor Final | 96 / 99 | 5 (CF) | no |

El DNI se precarga desde `contacts.dni` cuando el receptor es un contacto
existente. El CUIT se tipea en el momento — **no se agrega columna `cuit` a
`contacts`**; si más adelante se quiere reutilizar, es un cambio chico aparte.

> AFIP exige identificar al receptor en facturas B por encima de cierto monto, y
> ese umbral cambia por resolución. No se hardcodea: si el monto lo supera sin
> DNI, AFIP rechaza y se le muestra al usuario el error tal cual.

### Paso 3 — Monto y detalle

Un **detalle** (texto libre, ej. "Sesión de coaching") y un **monto total** con
IVA incluido. No hay lista de ítems: un comprobante = un concepto = un total.

Campos adicionales del formulario, con defaults sensatos:

- `cbteFecha` — hoy
- `fchServDesde` / `fchServHasta` — la fecha del turno si vino de ahí, si no hoy
- `fchVtoPago` — hoy

(Los tres campos de servicio son **obligatorios para AFIP** porque `Concepto = 2`.)

### Entradas al flujo

1. **Botón "Facturar" en el detalle del turno** → navega a
   `/facturacion/nueva?appointmentId=...`. Precarga contacto, nombre, DNI,
   `detalle` = nombre del servicio, `monto` = `service.price`. Todo editable.
2. **Pantalla "Nueva factura" suelta** → buscador de contacto opcional, o carga
   manual de nombre/DNI/CUIT para alguien que ni siquiera está en el sistema.

## Cálculo de importes

```
esFacturaC = cbteTipo === 11

si esFacturaC:
  impNeto = total;  impIVA = 0;  sin array Iva
si no:
  impNeto = round2(total / 1.21)
  impIVA  = round2(total - impNeto)
  Iva     = [{ Id: 5, BaseImp: impNeto, Importe: impIVA }]   // Id 5 = 21%

siempre: ImpTotConc = 0, ImpOpEx = 0, ImpTrib = 0, MonId = 'PES', MonCotiz = 1
```

Mandar `Iva` en una C, u omitirlo en una A/B con importe > 0, produce el error
AFIP 10070. `CondicionIVAReceptorId` es obligatorio en los tres tipos desde la
RG 5616 — sin ese campo AFIP rechaza el comprobante.

## Comprobante imprimible: HTML a demanda, sin Puppeteer

Descartado `@arcasdk/pdf` (Chromium en el build de Railway) y descartado también
renderizar HTML→PDF en el servidor, porque cualquier renderer headless trae el
mismo Chromium.

`GET /afip/invoices/:id/comprobante` devuelve **una página HTML** con el diseño
del comprobante y `@media print`, generada a partir de la fila de `invoices` —
que ya contiene todo, incluido `emisor_snapshot`. El usuario hace "Imprimir →
Guardar como PDF" desde el navegador.

Esto es suficiente fiscalmente: AFIP regula **qué tiene que contener** el
comprobante (CAE, vencimiento, QR, datos de emisor y receptor), no en qué
formato de archivo se lo entregás.

El QR se arma a mano con el formato documentado por AFIP, usando **`qrcode`, que
ya es dependencia de `apps/api`** — cero paquetes nuevos:

```js
const payload = {
  ver: 1, fecha: 'AAAA-MM-DD', cuit: emisorCuit, ptoVta, tipoCmp: cbteTipo,
  nroCmp: numero, importe: impTotal, moneda: 'PES', ctz: 1,
  tipoDocRec: docTipo, nroDocRec: docNro,
  tipoCodAut: 'E', codAut: Number(cae),
};
const url = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
const qrDataUri = await QRCode.toDataURL(url);   // <img src="${qrDataUri}">
```

Como el HTML se genera en el momento, se cae toda la sección 5 del prompt
original: sin bucket de storage, sin subida best-effort, sin reintento en
background, sin estado "PDF pendiente". Es determinístico y barato, y el CAE —
lo único fiscalmente relevante — ya está firme en la base.

Si más adelante hace falta un PDF real desde el servidor (para adjuntarlo a un
mail o mandarlo por WhatsApp), el camino es una librería PDF pura como `pdfkit`,
nunca un headless browser. Queda anotado, no se implementa ahora.

## Concurrencia en la numeración

`createNextVoucher` hace `getLastVoucher` + `createVoucher`, y esa secuencia no
es atómica del lado de AFIP. Dos emisiones simultáneas sobre el mismo punto de
venta pueden pedir el mismo número.

**Decisión: no se implementa lock.** El caso real es un negocio chico con un
administrador facturando, no varios operadores en paralelo. Si llegara a
ocurrir, AFIP rechaza el segundo comprobante (error 10016) — no duplica CAE ni
corrompe nada — y el usuario ve "reintentá". Queda marcado en el código como
comentario `ponytail:` con el camino de upgrade (lock distribuido en Redis, que
ya está disponible vía BullMQ) si el negocio crece a multi-operador.

## Superficie de la API

Montado en `/afip` desde `app.js`, con el middleware `auth` (scope por
`req.tenantId`, igual que el resto).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/afip/config` | Config del emisor. **Nunca** devuelve cert/key, solo `certConfigured` |
| PUT | `/afip/config` | Guarda config; cifra cert/key si vienen en el body |
| GET | `/afip/invoices` | Lista de comprobantes del tenant (paginada) |
| POST | `/afip/invoices` | Emite: valida → arma voucher → AFIP → INSERT |
| GET | `/afip/invoices/:id/comprobante` | Devuelve el comprobante en HTML imprimible, con QR |

Errores vía las clases de `src/errors/index.js` (`ValidationError`,
`NotFoundError`, `AppError`) — nunca `Error` pelado, según CLAUDE.md.

## Superficie del frontend

- **Settings → sección "Facturación AFIP"**: form de config del emisor (CUIT,
  situación fiscal, punto de venta, razón social, domicilio, IIBB, inicio de
  actividades, toggle testing/producción, carga de cert y key). Muestra
  "configurado ✓" en vez de los secretos.
- **`(dashboard)/facturacion/page.jsx`**: listado de comprobantes emitidos +
  botón "Nueva factura" + descarga de PDF.
- **`(dashboard)/facturacion/nueva/page.jsx`**: el formulario de emisión.
- **Detalle del turno**: botón "Facturar" y badge "Facturado ✓".

Ruta `facturacion`, **no** `billing` — `(dashboard)/billing` ya es la
suscripción del tenant a RecordAI y no tiene relación con esto.

## Arquitectura de módulos

| Archivo | Responsabilidad | Depende de |
|---|---|---|
| `apps/api/src/utils/crypto.js` | `encrypt`/`decrypt` AES-256-GCM | `ENCRYPTION_KEY` |
| `apps/api/src/services/afip/buildVoucher.js` | **función pura**: input del form + config → objeto voucher | nada |
| `apps/api/src/services/afip/ticketStorage.js` | `ITicketStoragePort` sobre Supabase | supabase |
| `apps/api/src/services/afip/index.js` | instancia el SDK y emite el comprobante | los dos de arriba, SDK |
| `apps/api/src/services/afip/comprobanteHtml.js` | fila de `invoices` → HTML imprimible + QR | `qrcode` |
| `apps/api/src/controllers/afip.controller.js` | HTTP, validación, persistencia | service, supabase |
| `apps/api/src/routes/afip.routes.js` | routing | controller, auth |

El corte importante es `buildVoucher.js`: toda la lógica fiscal con gotchas
(ramas A/B/C, aritmética de IVA, mapeo de `DocTipo`/`CondicionIVAReceptorId`,
formato `AAAAMMDD`) queda en una función pura, sin red ni base de datos. Es lo
que se puede testear de verdad.

## Testing

El repo ya tiene jest configurado (`apps/api/src/__tests__/`, `npm test` en
`apps/api`), pese a lo que dice CLAUDE.md.

`apps/api/src/__tests__/afip.test.js`:

- `buildVoucher` para C: `ImpNeto === total`, `ImpIVA === 0`, **sin** clave `Iva`
- `buildVoucher` para A: CUIT → `DocTipo 80`, `CondicionIVAReceptorId 1`, `Iva`
  presente, `ImpNeto + ImpIVA === ImpTotal`
- `buildVoucher` para B sin DNI: `DocTipo 99`, `DocNro 0`, `CondicionIVAReceptorId 5`
- `buildVoucher` para B con DNI: `DocTipo 96`
- A sin CUIT → lanza `ValidationError`
- `Concepto 2` siempre trae `FchServDesde`/`FchServHasta`/`FchVtoPago` en `AAAAMMDD`
- redondeo: un total como `100` no produce centavos que no cierren
- `crypto.js`: `decrypt(encrypt(x)) === x`, y que dos cifrados del mismo texto
  difieran (IV aleatorio)
- payload del QR: los campos y el orden que exige AFIP, y que el base64 decodifique
  al JSON original

Sin red, sin mocks del SDK, sin fixtures.

## Variables de entorno

Una sola nueva:

- `ENCRYPTION_KEY` — 32 bytes en hex o base64, para cifrar cert/key en reposo.

Se agrega a `envSchema` en [env.js](apps/api/src/config/env.js) como opcional
con default `''`, y a la lista de `required` bajo `NODE_ENV === 'production'`.

## Qué queda explícitamente afuera

- Notas de crédito y débito (12/13, 2/3). El modelo las soporta —`cbte_tipo` es
  un entero— pero no hay UI ni flujo. Se agrega cuando haga falta anular algo.
- Facturación automática al confirmar un turno. No hay dato de cobro que la
  dispare; ese es el punto de partida de todo este diseño.
- Lista de ítems por comprobante.
- CUIT persistido en `contacts`.
- Lock de numeración (ver arriba).
- Envío del comprobante por WhatsApp/mail al cliente. Eso sí necesitaría un PDF
  real generado en el servidor — con `pdfkit`, nunca con un headless browser.
