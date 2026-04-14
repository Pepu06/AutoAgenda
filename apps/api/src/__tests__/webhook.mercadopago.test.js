/**
 * Tests for Mercado Pago webhook handler
 * Key concern: does the subscription event update the subscription in DB?
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
const { getSubscriptionStatus } = require('../services/mercadopago');
const { handleMercadoPagoWebhook } = require('../controllers/webhook.controller');

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function mpWebhookReq(type, dataId, action = 'updated') {
  return {
    headers: {},
    body: { type, data: { id: dataId }, action },
  };
}

describe('handleMercadoPagoWebhook', () => {
  beforeEach(() => jest.clearAllMocks());

  test('subscription_preapproval authorized → updates status to active', async () => {
    getSubscriptionStatus.mockResolvedValue({
      id: 'pre-123',
      status: 'authorized',
    });

    let updatedStatus;
    supabase.from.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((data) => {
            updatedStatus = data.status;
            return { eq: jest.fn().mockResolvedValue({ error: null }) };
          }),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'sub-1', tenant_id: 'tenant-1' },
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });

    const req = mpWebhookReq('subscription_preapproval', 'pre-123');
    const res = makeRes();

    await handleMercadoPagoWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(updatedStatus).toBe('active');
  });

  test('subscription_preapproval cancelled → updates status to cancelled', async () => {
    getSubscriptionStatus.mockResolvedValue({
      id: 'pre-456',
      status: 'cancelled',
    });

    let updatedStatus;
    supabase.from.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          update: jest.fn().mockImplementation((data) => {
            updatedStatus = data.status;
            return { eq: jest.fn().mockResolvedValue({ error: null }) };
          }),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'sub-1', tenant_id: 'tenant-1' },
            error: null,
          }),
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
    });

    const req = mpWebhookReq('subscription_preapproval', 'pre-456');
    const res = makeRes();

    await handleMercadoPagoWebhook(req, res);

    expect(updatedStatus).toBe('cancelled');
  });

  test('subscription not found in DB → logs warn, still returns 200', async () => {
    getSubscriptionStatus.mockResolvedValue({ id: 'pre-999', status: 'authorized' });

    supabase.from.mockImplementation((table) => {
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {};
    });

    const req = mpWebhookReq('subscription_preapproval', 'pre-999');
    const res = makeRes();

    await handleMercadoPagoWebhook(req, res);

    // Should still return 200 (not crash)
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('unknown event type → returns 200 without DB writes', async () => {
    const req = mpWebhookReq('unknown_type', 'data-1');
    const res = makeRes();

    await handleMercadoPagoWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('payment type → returns 200 (handled as no-op for now)', async () => {
    const req = mpWebhookReq('payment', 'pay-1');
    const res = makeRes();

    await handleMercadoPagoWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
