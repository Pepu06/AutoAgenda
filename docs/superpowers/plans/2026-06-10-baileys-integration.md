# Baileys WhatsApp Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted WhatsApp provider (`baileys`) so tenants connect their own phone number via QR code scan, eliminating the need for a paid WasenderAPI subscription.

**Architecture:** A `BaileysSessionManager` singleton manages one Baileys socket per tenant, storing auth state (credentials + session keys) as JSON in a new `baileys_sessions` Supabase table. Tenants initiate connection via a QR code delivered through SSE; the existing `whatsapp.js` `provider` pattern is extended with a `baileys` case that routes sends through the active socket.

**Tech Stack:** `@whiskeysockets/baileys` (WhatsApp Web protocol), Supabase (auth state persistence), SSE (QR delivery), Next.js CSS Modules (frontend QR UI)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/services/baileys-auth-state.js` | Custom Supabase-backed auth state for Baileys |
| Create | `apps/api/src/services/baileys-session.js` | Session manager: start/stop/status per tenant |
| Create | `apps/api/src/controllers/baileys.controller.js` | HTTP handlers: QR SSE, status, disconnect |
| Create | `apps/api/src/routes/baileys.routes.js` | Route definitions for baileys endpoints |
| Modify | `apps/api/src/services/whatsapp.js` | Add `baileys` case to `sendTextMessage` + `sendInteractiveButtons` |
| Modify | `apps/api/src/controllers/settings.controller.js` | Add `baileys_connected` to SELECT + ALLOWED_FIELDS as read-only |
| Modify | `apps/api/src/app.js` | Register `/baileys` routes |
| Modify | `apps/api/src/index.js` | Call `restoreAllSessions()` on boot |
| Modify | `apps/web/src/app/(dashboard)/settings/page.jsx` | Add Baileys provider option + QR scanner section |
| SQL | `packages/db/migrations/009_baileys_sessions.sql` | New `baileys_sessions` table |

---

## Task 1: Install Baileys package

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/api && npm install @whiskeysockets/baileys
```

Expected: package appears in `node_modules/@whiskeysockets/baileys`, no errors.

> Note: Baileys has peer dep on `qrcode` for QR generation. Also install it:

```bash
cd apps/api && npm install qrcode
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@whiskeysockets/baileys'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore: add @whiskeysockets/baileys and qrcode deps"
```

---

## Task 2: DB migration — baileys_sessions table

**Files:**
- Create: `packages/db/migrations/009_baileys_sessions.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- packages/db/migrations/009_baileys_sessions.sql
create table if not exists baileys_sessions (
  tenant_id  uuid primary key references tenants(id) on delete cascade,
  creds_json jsonb,
  keys_json  jsonb,
  connected  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- RLS: service role only (API uses service key, so no user-level RLS needed)
alter table baileys_sessions enable row level security;
```

- [ ] **Step 2: Apply migration**

Open Supabase SQL Editor for this project and run the SQL above.
Verify: table `baileys_sessions` appears in the schema.

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/009_baileys_sessions.sql
git commit -m "feat: add baileys_sessions migration"
```

---

## Task 3: Supabase auth state adapter

**Files:**
- Create: `apps/api/src/services/baileys-auth-state.js`

Baileys needs an `authState` object with `{ state: { creds, keys }, saveCreds }`.
This adapter reads/writes the `baileys_sessions` table instead of the filesystem.

- [ ] **Step 1: Create the file**

```js
// apps/api/src/services/baileys-auth-state.js
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const { supabase } = require('@autoagenda/db');

/**
 * Returns a Baileys-compatible auth state backed by Supabase.
 * Compatible with Baileys' useMultiFileAuthState interface.
 */
async function useSupabaseAuthState(tenantId) {
  const { data: row } = await supabase
    .from('baileys_sessions')
    .select('creds_json, keys_json')
    .eq('tenant_id', tenantId)
    .single();

  const creds = row?.creds_json
    ? JSON.parse(JSON.stringify(row.creds_json), BufferJSON.reviver)
    : initAuthCreds();

  const keys = row?.keys_json
    ? JSON.parse(JSON.stringify(row.keys_json), BufferJSON.reviver)
    : {};

  const state = {
    creds,
    keys: {
      get: (type, ids) => {
        const data = {};
        for (const id of ids) {
          let value = keys[`${type}-${id}`];
          if (value) {
            if (type === 'app-state-sync-key') {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
        }
        return data;
      },
      set: async (data) => {
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = `${category}-${id}`;
            if (value) {
              keys[key] = value;
            } else {
              delete keys[key];
            }
          }
        }
        await _persist();
      },
    },
  };

  async function _persist() {
    const credsJson = JSON.parse(JSON.stringify(state.creds, BufferJSON.replacer));
    const keysJson  = JSON.parse(JSON.stringify(keys,        BufferJSON.replacer));

    await supabase.from('baileys_sessions').upsert({
      tenant_id:  tenantId,
      creds_json: credsJson,
      keys_json:  keysJson,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });
  }

  const saveCreds = _persist;

  return { state, saveCreds };
}

module.exports = { useSupabaseAuthState };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/baileys-auth-state.js
git commit -m "feat: add Supabase-backed Baileys auth state adapter"
```

---

## Task 4: Baileys session manager

**Files:**
- Create: `apps/api/src/services/baileys-session.js`

This is the core service. It keeps a `Map<tenantId, socket>` and handles QR events, connection updates, and reconnects.

- [ ] **Step 1: Create the file**

```js
// apps/api/src/services/baileys-session.js
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { supabase } = require('@autoagenda/db');
const { useSupabaseAuthState } = require('./baileys-auth-state');
const logger = require('../config/logger');

// tenantId -> { socket, qrCallbacks: Set<fn>, statusCallbacks: Set<fn> }
const sessions = new Map();

async function startSession(tenantId) {
  // If already have an open socket, return it
  if (sessions.has(tenantId)) {
    const existing = sessions.get(tenantId);
    if (existing.socket?.user) return existing.socket; // already connected
    stopSession(tenantId); // stale — restart
  }

  const entry = { socket: null, qrCallbacks: new Set(), statusCallbacks: new Set() };
  sessions.set(tenantId, entry);

  const { state, saveCreds } = await useSupabaseAuthState(tenantId);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ baileys: tenantId }),
    browser: ['RecordAI', 'Chrome', '1.0'],
  });

  entry.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Broadcast new QR to all SSE listeners for this tenant
      for (const cb of entry.qrCallbacks) cb(qr);
    }

    if (connection === 'open') {
      logger.info({ tenantId }, '[Baileys] Connected');
      await supabase
        .from('baileys_sessions')
        .upsert({ tenant_id: tenantId, connected: true, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
      for (const cb of entry.statusCallbacks) cb('connected');
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      logger.warn({ tenantId, reason }, '[Baileys] Disconnected');

      await supabase
        .from('baileys_sessions')
        .update({ connected: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      for (const cb of entry.statusCallbacks) cb('disconnected');

      sessions.delete(tenantId);

      if (!loggedOut) {
        // Reconnect after 5 seconds
        setTimeout(() => startSession(tenantId), 5000);
      } else {
        // Wipe stored credentials
        await supabase.from('baileys_sessions').delete().eq('tenant_id', tenantId);
      }
    }
  });

  return sock;
}

function stopSession(tenantId) {
  const entry = sessions.get(tenantId);
  if (entry?.socket) {
    try { entry.socket.end(undefined); } catch (_) {}
  }
  sessions.delete(tenantId);
}

function getSocket(tenantId) {
  return sessions.get(tenantId)?.socket ?? null;
}

function isConnected(tenantId) {
  const entry = sessions.get(tenantId);
  return Boolean(entry?.socket?.user);
}

function onQR(tenantId, callback) {
  if (!sessions.has(tenantId)) return () => {};
  sessions.get(tenantId).qrCallbacks.add(callback);
  return () => sessions.get(tenantId)?.qrCallbacks.delete(callback);
}

function onStatus(tenantId, callback) {
  if (!sessions.has(tenantId)) return () => {};
  sessions.get(tenantId).statusCallbacks.add(callback);
  return () => sessions.get(tenantId)?.statusCallbacks.delete(callback);
}

async function restoreAllSessions() {
  const { data: rows } = await supabase
    .from('baileys_sessions')
    .select('tenant_id, creds_json')
    .not('creds_json', 'is', null);

  if (!rows?.length) return;
  logger.info({ count: rows.length }, '[Baileys] Restoring sessions on boot');
  for (const row of rows) {
    startSession(row.tenant_id).catch((err) =>
      logger.error({ tenantId: row.tenant_id, err }, '[Baileys] Failed to restore session')
    );
  }
}

module.exports = { startSession, stopSession, getSocket, isConnected, onQR, onStatus, restoreAllSessions };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/baileys-session.js
git commit -m "feat: add Baileys session manager with auto-reconnect"
```

---

## Task 5: Baileys HTTP controller (QR SSE + status)

**Files:**
- Create: `apps/api/src/controllers/baileys.controller.js`

- [ ] **Step 1: Create the file**

```js
// apps/api/src/controllers/baileys.controller.js
const QRCode = require('qrcode');
const { startSession, stopSession, isConnected, onQR, onStatus } = require('../services/baileys-session');
const { supabase } = require('@autoagenda/db');

async function getStatus(req, res, next) {
  try {
    const connected = isConnected(req.tenantId);
    return res.json({ success: true, data: { connected } });
  } catch (err) { return next(err); }
}

async function connect(req, res, next) {
  try {
    await startSession(req.tenantId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

async function disconnect(req, res, next) {
  try {
    stopSession(req.tenantId);
    await supabase.from('baileys_sessions').delete().eq('tenant_id', req.tenantId);
    return res.json({ success: true });
  } catch (err) { return next(err); }
}

// SSE endpoint — streams QR codes and connection events
function qrStream(req, res) {
  const tenantId = req.tenantId;

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  if (isConnected(tenantId)) {
    res.write('event: connected\ndata: {}\n\n');
    return res.end();
  }

  // Make sure session is starting
  startSession(tenantId).catch(() => {});

  const removeQR = onQR(tenantId, async (qrRaw) => {
    const dataUrl = await QRCode.toDataURL(qrRaw);
    res.write(`event: qr\ndata: ${JSON.stringify({ qr: dataUrl })}\n\n`);
  });

  const removeStatus = onStatus(tenantId, (status) => {
    res.write(`event: ${status}\ndata: {}\n\n`);
    if (status === 'connected' || status === 'disconnected') {
      cleanup();
      res.end();
    }
  });

  function cleanup() {
    removeQR();
    removeStatus();
  }

  req.on('close', cleanup);
}

module.exports = { getStatus, connect, disconnect, qrStream };
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/controllers/baileys.controller.js
git commit -m "feat: add Baileys HTTP controller with QR SSE"
```

---

## Task 6: Baileys routes

**Files:**
- Create: `apps/api/src/routes/baileys.routes.js`
- Modify: `apps/api/src/app.js`

- [ ] **Step 1: Create routes file**

```js
// apps/api/src/routes/baileys.routes.js
const { Router } = require('express');
const auth = require('../middleware/auth');
const { getStatus, connect, disconnect, qrStream } = require('../controllers/baileys.controller');

const router = Router();
router.use(auth);

router.get('/status',     getStatus);
router.post('/connect',   connect);
router.delete('/session', disconnect);
router.get('/qr',         qrStream);

module.exports = router;
```

- [ ] **Step 2: Register in app.js**

Open `apps/api/src/app.js` and find where other routes are registered (look for lines like `app.use('/settings', ...)`). Add:

```js
app.use('/baileys', require('./routes/baileys.routes'));
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/baileys.routes.js apps/api/src/app.js
git commit -m "feat: register /baileys routes"
```

---

## Task 7: Integrate Baileys into whatsapp.js

**Files:**
- Modify: `apps/api/src/services/whatsapp.js`

- [ ] **Step 1: Add baileys case to sendTextMessage**

At the top of `apps/api/src/services/whatsapp.js`, add the import after the existing requires:

```js
const { getSocket } = require('./baileys-session');
```

In `sendTextMessage`, add a `baileys` case before the `meta` fallback:

```js
async function sendTextMessage(phone, text, tenantConfig = {}) {
  const provider = tenantConfig.provider || 'meta';

  if (provider === 'wasender') {
    return sendWasenderMessage(phone, text, tenantConfig.wasender_api_key);
  }

  if (provider === 'baileys') {
    return sendBaileysTextMessage(tenantConfig.tenantId, phone, text);
  }

  return sendMetaTextMessage(phone, text, tenantConfig);
}
```

- [ ] **Step 2: Add sendBaileysTextMessage implementation**

Add this function before `sendMetaTextMessage`:

```js
async function sendBaileysTextMessage(tenantId, phone, text) {
  const sock = getSocket(tenantId);
  if (!sock?.user) throw new Error(`[Baileys] No active session for tenant ${tenantId}`);

  // Baileys expects JID format: phone@s.whatsapp.net (remove + prefix if present)
  const jid = phone.replace(/^\+/, '') + '@s.whatsapp.net';
  const result = await sock.sendMessage(jid, { text });
  logger.info({ tenantId, phone, messageId: result?.key?.id }, '[Baileys] Mensaje enviado');
  return result;
}
```

- [ ] **Step 3: Add baileys case to sendInteractiveButtons**

In `sendInteractiveButtons`, add after the wasender block:

```js
if (provider === 'baileys') {
  // Baileys supports buttons natively via interactive messages
  const jid = phone.replace(/^\+/, '') + '@s.whatsapp.net';
  const sock = getSocket(tenantConfig.tenantId);
  if (!sock?.user) throw new Error(`[Baileys] No active session for tenant ${tenantConfig.tenantId}`);

  const result = await sock.sendMessage(jid, {
    text: body,
    footer: '',
    buttons: buttons.map(btn => ({ buttonId: btn.id, buttonText: { displayText: btn.title }, type: 1 })),
    headerType: 1,
  });
  logger.info({ phone }, '[Baileys] Interactive enviado');
  return result;
}
```

- [ ] **Step 4: Pass tenantId through tenantConfig in workers**

Search for all calls to `sendTextMessage` and `sendInteractiveButtons` in `apps/api/src/workers/` to verify `tenantConfig` already includes the tenant's `provider`. Open `apps/api/src/workers/sendConfirmation.js` and check. If `tenantConfig` is built from the DB row, ensure `tenantId` is included:

```js
// Example pattern in workers — confirm this matches existing code:
const tenantConfig = {
  provider: tenant.whatsappProvider,
  tenantId: tenant.id,   // <-- must be present for baileys
  whatsappPhoneNumberId: tenant.whatsappPhoneNumberId,
  whatsappAccessToken:   tenant.whatsappAccessToken,
  wasender_api_key:      tenant.wasenderApiKey,
};
```

If `tenantId` is missing from the tenantConfig object in any worker, add it.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/whatsapp.js apps/api/src/workers/
git commit -m "feat: add baileys provider to whatsapp service"
```

---

## Task 8: Restore sessions on boot

**Files:**
- Modify: `apps/api/src/index.js`

- [ ] **Step 1: Import and call restoreAllSessions**

In `apps/api/src/index.js`, add after the existing require lines:

```js
const { restoreAllSessions } = require('./services/baileys-session');
```

And inside the `app.listen` callback, after the existing cron starts:

```js
restoreAllSessions().catch(err => logger.error({ err }, '[Baileys] Session restore failed'));
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/index.js
git commit -m "feat: restore Baileys sessions on API boot"
```

---

## Task 9: Settings controller — expose baileys_connected

**Files:**
- Modify: `apps/api/src/controllers/settings.controller.js`

The frontend needs to know if a Baileys session is active. We expose this as a read-only computed field (from `baileys_sessions` table join).

- [ ] **Step 1: Update getSettings to include baileys status**

Replace the `getSettings` function with:

```js
async function getSettings(req, res, next) {
  try {
    const [settingsResult, baileysResult] = await Promise.all([
      supabase.from('tenants').select(SELECT_COLS).eq('id', req.tenantId).single(),
      supabase.from('baileys_sessions').select('connected').eq('tenant_id', req.tenantId).single(),
    ]);

    if (settingsResult.error) throw settingsResult.error;

    const data = convertKeys(settingsResult.data);
    data.baileysConnected = baileysResult.data?.connected ?? false;

    return res.json({ success: true, data });
  } catch (err) { return next(err); }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/controllers/settings.controller.js
git commit -m "feat: expose baileysConnected status in settings response"
```

---

## Task 10: Frontend — QR scanner in Settings

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.jsx`

This task adds:
1. `baileys` option in the provider selector
2. A QR scanner section that appears when `whatsappProvider === 'baileys'` and `!baileysConnected`
3. A "Desconectar" button when connected

- [ ] **Step 1: Add baileysConnected to state and load it**

In the `DEFAULTS` object, add:
```js
baileysConnected: false,
```

In the `useEffect` data mapping block (around line 80), add:
```js
if (d.baileysConnected != null) mapped.baileysConnected = d.baileysConnected;
```

- [ ] **Step 2: Add QR scanner hook**

Add this hook inside `SettingsPage` (before the return):

```js
const [qrImage, setQrImage] = useState(null);
const [qrLoading, setQrLoading] = useState(false);
const [qrError, setQrError] = useState('');
const eventSourceRef = useRef(null);

function startQRScan() {
  if (eventSourceRef.current) eventSourceRef.current.close();
  setQrLoading(true);
  setQrImage(null);
  setQrError('');

  // Trigger session start
  api.post('/baileys/connect').catch(() => {});

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const es = new EventSource(`${apiUrl}/baileys/qr?token=${token}`);
  eventSourceRef.current = es;

  es.addEventListener('qr', (e) => {
    const { qr } = JSON.parse(e.data);
    setQrImage(qr);
    setQrLoading(false);
  });

  es.addEventListener('connected', () => {
    es.close();
    setQrImage(null);
    setQrLoading(false);
    set('baileysConnected', true);
  });

  es.addEventListener('disconnected', () => {
    es.close();
    setQrImage(null);
    setQrLoading(false);
    setQrError('Conexión fallida. Intentá de nuevo.');
  });

  es.onerror = () => {
    setQrLoading(false);
    setQrError('Error de conexión.');
    es.close();
  };
}

async function handleBaileysDisconnect() {
  await api.delete('/baileys/session');
  set('baileysConnected', false);
  setQrImage(null);
}

useEffect(() => {
  return () => eventSourceRef.current?.close();
}, []);
```

Also add `useRef` to the imports at the top:
```js
import { useEffect, useState, useRef } from 'react';
```

> Note: `EventSource` doesn't natively support custom headers. Passing the token as a query param is acceptable for this internal endpoint. Alternatively, use `@microsoft/fetch-event-source` for header-based auth — but query param is simpler for now.

- [ ] **Step 3: Add Baileys UI section**

Find the WhatsApp provider section in the JSX (search for `whatsappProvider` or `wasenderApiKey`). After the existing Wasender config block, add a Baileys section:

```jsx
{/* BAILEYS PROVIDER OPTION */}
{/* Add 'baileys' to the existing provider <select> options: */}
{/* <option value="baileys">WhatsApp Propio (sin costo extra)</option> */}

{settings.whatsappProvider === 'baileys' && (
  <Field label="Conexión WhatsApp">
    {settings.baileysConnected ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: 'var(--success, #22c55e)', fontWeight: 600 }}>● Conectado</span>
        <button
          className={styles.btnSecondary}
          onClick={handleBaileysDisconnect}
          type="button"
        >
          Desconectar
        </button>
      </div>
    ) : (
      <div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Escaneá el código QR con tu WhatsApp para conectar tu número.
          El código expira cada 20 segundos — se actualiza automáticamente.
        </p>
        {qrError && <p style={{ color: 'var(--error, #ef4444)', fontSize: '13px', marginBottom: '8px' }}>{qrError}</p>}
        {qrImage ? (
          <img src={qrImage} alt="QR WhatsApp" style={{ width: '200px', height: '200px', borderRadius: '8px' }} />
        ) : (
          <button
            className={styles.btn}
            onClick={startQRScan}
            disabled={qrLoading}
            type="button"
          >
            {qrLoading ? 'Generando QR...' : 'Conectar WhatsApp'}
          </button>
        )}
      </div>
    )}
  </Field>
)}
```

Also add `'baileys'` to the provider `<select>` in the existing WhatsApp provider dropdown. Find the select with options `meta` and `wasender`, and add:
```jsx
<option value="baileys">WhatsApp Propio (sin costo extra)</option>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(dashboard)/settings/page.jsx
git commit -m "feat: add Baileys QR scanner UI in Settings"
```

---

## Task 11: Auth fix — pass token via query param in SSE

**Files:**
- Modify: `apps/api/src/middleware/auth.js`

`EventSource` in the browser cannot send headers. The QR SSE endpoint needs to accept the JWT via query param as fallback.

- [ ] **Step 1: Read auth middleware**

Open `apps/api/src/middleware/auth.js` and find where it reads the Bearer token from `Authorization` header. Add a fallback to read from `req.query.token`:

```js
// In auth.js, find the token extraction line and update it:
const token =
  (req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null) || req.query.token;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/middleware/auth.js
git commit -m "fix: allow JWT via query param for SSE endpoints"
```

---

## Task 12: Smoke test end-to-end

No automated tests are configured. Manual verification steps:

- [ ] **Step 1: Start API and Web**

```bash
npm run dev
```

- [ ] **Step 2: Verify backend endpoints exist**

```bash
curl -s http://localhost:3001/baileys/status \
  -H "Authorization: Bearer <your_test_token>" | jq .
```

Expected: `{ "success": true, "data": { "connected": false } }`

- [ ] **Step 3: Open Settings in browser**

1. Go to `http://localhost:3000/settings`
2. Change WhatsApp provider to "WhatsApp Propio"
3. Save settings
4. A "Conectar WhatsApp" button should appear

- [ ] **Step 4: Scan QR**

1. Click "Conectar WhatsApp"
2. QR code should appear within 5 seconds
3. Scan with WhatsApp on phone
4. Status should change to "● Conectado"

- [ ] **Step 5: Send test message**

Create a test appointment for a contact. Verify the confirmation message arrives via WhatsApp from the connected number.

- [ ] **Step 6: Test reconnect on restart**

Restart the API. Check logs for `[Baileys] Restoring sessions on boot`. The session should auto-reconnect without re-scanning QR.

---

## Self-Review

**Spec coverage:**
- ✅ Baileys as new `provider` in whatsapp.js
- ✅ Session manager with Map<tenantId, socket>
- ✅ Auth state persisted to Supabase
- ✅ Auto-reconnect on disconnect
- ✅ QR delivery via SSE
- ✅ Session restore on boot
- ✅ Frontend QR scanner UI
- ✅ Frontend disconnect button
- ✅ SSE auth via query param

**Known limitations documented:**
- `sendTemplate` not extended for Baileys (templates are Meta-specific; Baileys uses `sendTextMessage` equivalent)
- Interactive buttons via Baileys use the older button format — newer WhatsApp clients may show them differently; fallback to plain text is an option if issues arise

**Type consistency:** All references to `baileys-session.js` exports (`startSession`, `stopSession`, `getSocket`, `isConnected`, `onQR`, `onStatus`, `restoreAllSessions`) are consistent across Tasks 4, 5, 7, 8.
