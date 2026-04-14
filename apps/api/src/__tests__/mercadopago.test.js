/**
 * Tests for mercadopago service
 * - getPlanConfig alias handling
 * - createSubscription with mpPlanId returns checkout URL without DB write
 */

jest.mock('../config/env', () => ({
  MERCADOPAGO_ACCESS_TOKEN: 'test-token',
  BASE_URL: 'https://test.example.com',
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@autoagenda/db', () => ({
  supabase: { from: jest.fn() },
}));

// Mock mercadopago SDK
jest.mock('mercadopago', () => {
  const PreApproval = jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
  }));
  return { MercadoPagoConfig: jest.fn(), PreApproval };
});

const { getPlanConfig, createSubscription, PLANS } = require('../services/mercadopago');
const { supabase } = require('@autoagenda/db');

describe('getPlanConfig', () => {
  test('returns plan by exact key', () => {
    expect(getPlanConfig('inicial')).toBe(PLANS.inicial);
    expect(getPlanConfig('profesional')).toBe(PLANS.profesional);
    expect(getPlanConfig('trial')).toBe(PLANS.trial);
  });

  test('handles "basic" alias → inicial', () => {
    expect(getPlanConfig('basic')).toBe(PLANS.inicial);
  });

  test('handles "pro" alias → profesional', () => {
    expect(getPlanConfig('pro')).toBe(PLANS.profesional);
  });

  test('returns null for unknown plan', () => {
    expect(getPlanConfig('nonexistent')).toBeNull();
  });
});

describe('createSubscription with mpPlanId (pre-created plans)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns checkout URL without writing to DB', async () => {
    // All paid plans have mpPlanId, so they redirect directly
    const result = await createSubscription('tenant-1', 'inicial', { email: 'test@test.com' });

    expect(result.initPoint).toContain('mercadopago.com.ar/subscriptions/checkout');
    expect(result.initPoint).toContain(PLANS.inicial.mpPlanId);
    expect(result.subscriptionId).toBeNull();
    expect(result.status).toBe('pending');

    // Must NOT write to supabase since user hasn't paid yet
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws for invalid plan', async () => {
    await expect(
      createSubscription('tenant-1', 'invalid', { email: 'test@test.com' })
    ).rejects.toThrow('Invalid plan');
  });
});

describe('PLANS configuration', () => {
  test('all paid plans have mpPlanId', () => {
    expect(PLANS.inicial.mpPlanId).toBeTruthy();
    expect(PLANS.profesional.mpPlanId).toBeTruthy();
    expect(PLANS.custom.mpPlanId).toBeTruthy();
  });

  test('trial plan has no mpPlanId', () => {
    expect(PLANS.trial.mpPlanId).toBeUndefined();
  });

  test('paid plan message limits are positive integers', () => {
    expect(PLANS.inicial.messageLimit).toBeGreaterThan(0);
    expect(PLANS.profesional.messageLimit).toBeGreaterThan(0);
    expect(PLANS.custom.messageLimit).toBeGreaterThan(0);
  });

  test('trial plan has null message limit (unlimited)', () => {
    expect(PLANS.trial.messageLimit).toBeNull();
  });
});
