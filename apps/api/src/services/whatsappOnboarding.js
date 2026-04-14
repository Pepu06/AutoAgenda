const env = require('../config/env');

const GRAPH_BASE = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

/**
 * Verify a phone_number_id belongs to the owner's WABA and return display info.
 * Used for both path A (Embedded Signup) and path B (manual entry).
 */
async function verifyPhoneNumber(phoneNumberId) {
  const token = env.META_SYSTEM_USER_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
  const res = await fetch(
    `${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Graph API error ${res.status}`);
  }

  return res.json(); // { id, display_phone_number, verified_name, code_verification_status }
}

/**
 * Path A — Embedded Signup: exchange the OAuth code returned by the FB SDK
 * for a user access token that lets us identify which WABA they own.
 */
async function exchangeCodeForUserToken(code) {
  const params = new URLSearchParams({
    client_id:     env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri:  '',
    code,
  });

  const res = await fetch(`https://graph.facebook.com/oauth/access_token?${params}`);
  const data = await res.json();

  if (data.error) throw new Error(data.error.message || 'Failed to exchange code');
  return data.access_token;
}

/**
 * Path A — List phone numbers in the owner's WABA that the user just authorized.
 * Returns array of { id, display_phone_number, verified_name }
 */
async function listUserPhoneNumbers(userToken) {
  // Get businesses owned by user
  const bizRes = await fetch(
    `${GRAPH_BASE}/me/businesses?fields=id,name&access_token=${userToken}`
  );
  const bizData = await bizRes.json();
  if (bizData.error) throw new Error(bizData.error.message);

  const phones = [];
  for (const biz of bizData.data || []) {
    const wabaRes = await fetch(
      `${GRAPH_BASE}/${biz.id}/owned_whatsapp_business_accounts?fields=id&access_token=${userToken}`
    );
    const wabaData = await wabaRes.json();
    for (const waba of wabaData.data || []) {
      const numRes = await fetch(
        `${GRAPH_BASE}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${userToken}`
      );
      const numData = await numRes.json();
      for (const num of numData.data || []) {
        phones.push({ ...num, wabaId: waba.id });
      }
    }
  }
  return phones;
}

module.exports = { verifyPhoneNumber, exchangeCodeForUserToken, listUserPhoneNumbers };
