const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// PGRST303 ("JWT issued at future") is PostgREST rejecting our static
// service-role key due to a momentary clock skew on Supabase's side, not
// anything wrong with the token itself — retrying right after succeeds.
// queryFn must build and return a fresh query builder on each call, since
// a builder can only be awaited once.
const RETRYABLE_POSTGREST_CODES = new Set(['PGRST303']);

async function withRetry(queryFn) {
  let result = await queryFn();
  if (result?.error && RETRYABLE_POSTGREST_CODES.has(result.error.code)) {
    result = await queryFn();
  }
  return result;
}

// Converts snake_case keys to camelCase recursively
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function convertKeys(obj) {
  if (Array.isArray(obj)) return obj.map(convertKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), convertKeys(v)])
    );
  }
  return obj;
}

module.exports = { supabase, convertKeys, withRetry };
