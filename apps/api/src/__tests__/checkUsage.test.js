/**
 * Tests for checkUsageLimit — enforces message limits per plan
 */

jest.mock('@autoagenda/db', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock mercadopago service to avoid env var issues
jest.mock('../services/mercadopago', () => ({
  getPlanConfig: jest.fn(),
}));

const { supabase } = require('@autoagenda/db');
const { getPlanConfig } = require('../services/mercadopago');
const { checkUsageLimit } = require('../middleware/checkUsage');

function stubSupabase(tenantData, subscriptionData) {
  supabase.from.mockImplementation((table) => {
    const isTenant = table === 'tenants';
    const mockData = isTenant ? tenantData : subscriptionData;
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    };
  });
}

const FUTURE = new Date(Date.now() + 86400000 * 10).toISOString(); // 10 days ahead
const PAST   = new Date(Date.now() - 86400000 * 1).toISOString();  // 1 day ago

describe('checkUsageLimit', () => {
  beforeEach(() => jest.clearAllMocks());

  test('trial active → allowed', async () => {
    stubSupabase(
      { messages_sent_this_month: 500 },
      { plan: 'trial', status: 'active', current_period_end: FUTURE }
    );

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('trial');
  });

  test('trial expired → denied trial_expired', async () => {
    stubSupabase(
      { messages_sent_this_month: 0 },
      { plan: 'trial', status: 'active', current_period_end: PAST }
    );

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('trial_expired');
  });

  test('subscription not active → denied', async () => {
    stubSupabase(
      { messages_sent_this_month: 0 },
      { plan: 'inicial', status: 'cancelled', current_period_end: FUTURE }
    );
    getPlanConfig.mockReturnValue({ messageLimit: 100, name: 'Inicial' });

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('subscription_inactive');
  });

  test('within message limit → allowed', async () => {
    stubSupabase(
      { messages_sent_this_month: 50 },
      { plan: 'inicial', status: 'active', current_period_end: FUTURE }
    );
    getPlanConfig.mockReturnValue({ messageLimit: 100, name: 'Inicial' });

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(50);
    expect(result.limit).toBe(100);
  });

  test('at message limit → denied limit_exceeded', async () => {
    stubSupabase(
      { messages_sent_this_month: 100 },
      { plan: 'inicial', status: 'active', current_period_end: FUTURE }
    );
    getPlanConfig.mockReturnValue({ messageLimit: 100, name: 'Inicial' });

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('limit_exceeded');
    expect(result.current).toBe(100);
  });

  test('unlimited plan (messageLimit null) → always allowed', async () => {
    stubSupabase(
      { messages_sent_this_month: 9999 },
      { plan: 'custom', status: 'active', current_period_end: FUTURE }
    );
    getPlanConfig.mockReturnValue({ messageLimit: null, name: 'Custom' });

    const result = await checkUsageLimit('tenant-1');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('unlimited');
  });
});
