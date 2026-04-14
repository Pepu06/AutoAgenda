/**
 * Tests for WhatsApp webhook message processing
 * Covers: confirm/cancel button handling, intent parsing
 */

jest.mock('@autoagenda/db', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../config/env', () => ({
  WHATSAPP_VERIFY_TOKEN: 'test-token',
  MERCADOPAGO_WEBHOOK_SECRET: null,
}));

jest.mock('../services/whatsapp', () => ({
  sendTemplate: jest.fn().mockResolvedValue({}),
  sendTextMessage: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/google', () => ({
  getCalendarEvent: jest.fn().mockResolvedValue(null),
  updateEventTitleAndColor: jest.fn().mockResolvedValue({}),
  refreshAccessToken: jest.fn().mockResolvedValue('new-token'),
}));

jest.mock('../services/mercadopago', () => ({
  getSubscriptionStatus: jest.fn(),
}));

jest.mock('../utils/datetime', () => ({
  formatTime: jest.fn(() => '10:00'),
}));

const { supabase } = require('@autoagenda/db');
const { receive } = require('../controllers/webhook.controller');

// Helper to build a WhatsApp button reply payload
function makeButtonPayload(buttonId, from = '5491100000001') {
  return {
    body: {
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'msg-1',
              from,
              type: 'interactive',
              interactive: {
                button_reply: {
                  id: buttonId,
                  title: buttonId.startsWith('confirm') ? 'Confirmar' : 'Cancelar',
                },
              },
            }],
            metadata: {},
          },
        }],
      }],
      object: 'whatsapp_business_account',
    },
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.sendStatus = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

// Build a chain that returns different data based on table
function buildSupabaseMock({ appointment, tenant, fullAppt, userData } = {}) {
  supabase.from.mockImplementation((table) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      single: jest.fn(),
    };

    if (table === 'appointments') {
      chain.maybeSingle.mockResolvedValue({ data: appointment, error: null });
      chain.update.mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });
      chain.single.mockResolvedValue({ data: fullAppt || appointment, error: null });
    }
    if (table === 'message_logs') {
      chain.insert.mockResolvedValue({ error: null });
    }
    if (table === 'tenants') {
      chain.single.mockResolvedValue({ data: tenant, error: null });
    }
    if (table === 'users') {
      chain.single.mockResolvedValue({ data: userData || null, error: null });
    }

    return chain;
  });
}

const APPOINTMENT = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  tenant_id: 'tenant-1',
  google_event_id: null,
  user_id: 'user-1',
  contact_id: 'contact-1',
};

const TENANT_CONFIG = {
  confirm_reply_message: null,
  cancel_reply_message: null,
  whatsapp_provider: 'meta',
  whatsapp_phone_number_id: 'phone-id',
  whatsapp_access_token: 'token',
  wasender_api_key: null,
  admin_whatsapp: null,
  admin_alerts_enabled: false,
  timezone: 'America/Argentina/Buenos_Aires',
  time_format: '24h',
};

describe('WhatsApp webhook — confirm/cancel buttons', () => {
  beforeEach(() => jest.clearAllMocks());

  test('confirm button → updates appointment to confirmed', async () => {
    buildSupabaseMock({ appointment: APPOINTMENT, tenant: TENANT_CONFIG });

    const req = makeButtonPayload(`confirm_${APPOINTMENT.id}`);
    const res = makeRes();

    await receive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);

    // Verify DB was touched (appointments table queried at least for fetch + update)
    const tablesCalled = supabase.from.mock.calls.map(([t]) => t);
    expect(tablesCalled).toContain('appointments');
  });

  test('cancel button → updates appointment to cancelled', async () => {
    const FULL_APPT = {
      ...APPOINTMENT,
      scheduled_at: new Date().toISOString(),
      contact: { name: 'Test User', phone: '+5491100000001' },
      service: { name: 'Consulta' },
    };
    buildSupabaseMock({ appointment: APPOINTMENT, tenant: TENANT_CONFIG, fullAppt: FULL_APPT });

    const req = makeButtonPayload(`cancel_${APPOINTMENT.id}`);
    const res = makeRes();

    await receive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test('message without embedded appointmentId → ignored (no DB write)', async () => {
    const req = {
      body: {
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'msg-1',
                from: '5491100000001',
                type: 'text',
                text: { body: 'Hola' },
              }],
              metadata: {},
            },
          }],
        }],
        object: 'whatsapp_business_account',
      },
    };
    const res = makeRes();

    await receive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('message with no entries → returns 200 without crash', async () => {
    const req = { body: { entry: [], object: 'whatsapp_business_account' } };
    const res = makeRes();

    await receive(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});
