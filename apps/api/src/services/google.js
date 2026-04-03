const env = require('../config/env');

const TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CAL_BASE     = 'https://www.googleapis.com/calendar/v3';

async function exchangeCodeForTokens(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  'postmessage',
      grant_type:    'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data; // { access_token, refresh_token, id_token, expires_in }
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function getUserInfo(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

// Returns events array, or null if token is expired (401)
async function getCalendarEvents(accessToken, { days = 30 } = {}) {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '100',
    timeMin,
    timeMax,
  });

  const res = await fetch(`${CAL_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) return null; // expired
  const data = await res.json();
  if (!data.items) {
    console.error('Google Calendar API error:', JSON.stringify(data));
    return [];
  }
  return data.items;
}

// Google Calendar color IDs by appointment status
const STATUS_COLORS = {
  pending:   '5',  // Banana  (yellow)
  notified:  '5',  // Banana  (yellow) — same as pending, confirmation sent
  confirmed: '2',  // Sage    (green)
  cancelled: '11', // Tomato  (red)
};

async function updateEventColor(accessToken, eventId, status) {
  const colorId = STATUS_COLORS[status];
  if (!colorId || !eventId) return;

  await fetch(`${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ colorId }),
  });
}

async function getCalendarEvent(accessToken, eventId) {
  const res = await fetch(`${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function updateEventTitleAndColor(accessToken, eventId, title, status, { sendUpdates = 'none' } = {}) {
  const patch = {};
  if (title) patch.summary = title;
  if (status && STATUS_COLORS[status]) patch.colorId = STATUS_COLORS[status];
  if (!Object.keys(patch).length) return;

  const params = new URLSearchParams();
  if (sendUpdates && sendUpdates !== 'none') params.set('sendUpdates', sendUpdates);

  const url = `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}${params.toString() ? `?${params}` : ''}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    let details = '';
    try {
      const data = await res.json();
      details = data?.error?.message || data?.error_description || JSON.stringify(data);
    } catch {
      details = await res.text();
    }
    throw new Error(`Google Calendar PATCH failed (${res.status}): ${details || 'unknown error'}`);
  }
}

// Fetch today's events in Argentina time (UTC-3)
async function getTodayCalendarEvents(accessToken) {
  const now = new Date();
  // Argentina is always UTC-3
  const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
  const serverOffsetMs = now.getTimezoneOffset() * 60 * 1000; // server UTC offset in ms (positive = behind UTC)
  const arNow = new Date(now.getTime() + AR_OFFSET_MS + serverOffsetMs);

  const todayStart = new Date(arNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(arNow);
  todayEnd.setHours(23, 59, 59, 999);

  // Convert back to UTC for the API call
  const timeMin = new Date(todayStart.getTime() - AR_OFFSET_MS - serverOffsetMs).toISOString();
  const timeMax = new Date(todayEnd.getTime() - AR_OFFSET_MS - serverOffsetMs).toISOString();

  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '50',
    timeMin,
    timeMax,
  });

  const res = await fetch(`${CAL_BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) return null;
  const data = await res.json();
  return data.items || [];
}

async function createCalendarEvent(accessToken, { summary, description, startDateTime, endDateTime, attendees = [] }) {
  const body = {
    summary,
    description,
    start: { dateTime: startDateTime },
    end:   { dateTime: endDateTime },
  };
  if (attendees.length) body.attendees = attendees.map(email => ({ email }));

  const params = new URLSearchParams();
  if (attendees.length) params.set('sendUpdates', 'all');

  const url = `${CAL_BASE}/calendars/primary/events${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar POST failed (${res.status}): ${data?.error?.message || 'unknown error'}`);
  }
  return res.json();
}

module.exports = {
  exchangeCodeForTokens,
  refreshAccessToken,
  getUserInfo,
  getCalendarEvents,
  getCalendarEvent,
  getTodayCalendarEvents,
  updateEventColor,
  updateEventTitleAndColor,
  createCalendarEvent,
};
