// apps/api/src/services/baileys-auth-state.js
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const { supabase } = require('@autoagenda/db');
const logger = require('../config/logger');

/**
 * Returns a Baileys-compatible auth state backed by Supabase.
 * Compatible with Baileys' useMultiFileAuthState interface.
 *
 * @param {string} tenantId
 * @param {() => boolean} [isActive] - guard; when it returns false this state
 *   belongs to a superseded socket and must NOT persist (would clobber the
 *   live socket's fresh credentials with stale data).
 */
async function useSupabaseAuthState(tenantId, isActive) {
  const { data: row, error: loadError } = await supabase
    .from('baileys_sessions')
    .select('creds_json, keys_json')
    .eq('tenant_id', tenantId)
    .single();

  // PGRST116 = no row found (expected for new tenants)
  if (loadError && loadError.code !== 'PGRST116') throw loadError;

  logger.debug({ tenantId, fresh: !row?.creds_json }, '[BaileysAuth] Auth state loaded');

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
    // Stale socket generation — dropping these writes prevents clobbering the
    // live socket's freshly-saved credentials.
    if (typeof isActive === 'function' && !isActive()) {
      logger.debug({ tenantId }, '[BaileysAuth] Skipping persist from superseded socket');
      return;
    }

    const credsJson = JSON.parse(JSON.stringify(state.creds, BufferJSON.replacer));
    const keysJson  = JSON.parse(JSON.stringify(keys,        BufferJSON.replacer));

    const { error: upsertError } = await supabase.from('baileys_sessions').upsert({
      tenant_id:  tenantId,
      creds_json: credsJson,
      keys_json:  keysJson,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id' });

    if (upsertError) {
      // Concurrent upserts from rapid saveCreds calls can cause serialization
      // failures — log and swallow; next saveCreds call will persist the latest state.
      logger.warn({ tenantId, err: upsertError.message }, '[BaileysAuth] Upsert conflict — will retry on next creds.update');
      return;
    }

    logger.debug({ tenantId }, '[BaileysAuth] Credentials persisted');
  }

  const saveCreds = _persist;

  return { state, saveCreds };
}

module.exports = { useSupabaseAuthState };
