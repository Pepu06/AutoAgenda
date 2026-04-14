/**
 * Tests for tenantAuth middleware
 * Covers: validateTenantAccess, getUserTenants
 */

jest.mock('@autoagenda/db', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { supabase } = require('@autoagenda/db');
const { validateTenantAccess, getUserTenants } = require('../middleware/tenantAuth');

function makeReq(overrides = {}) {
  return {
    tenantId: 'tenant-jwt',
    userId: 'user-1',
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function mockSupabaseChain(returnValue) {
  const chain = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(returnValue),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('validateTenantAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  test('no tenantId in request → next() with JWT tenantId unchanged', async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    const next = jest.fn();

    await validateTenantAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-jwt');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('tenantId in body matches JWT → next() without DB check', async () => {
    const req = makeReq({ body: { tenantId: 'tenant-jwt' } });
    const res = makeRes();
    const next = jest.fn();

    await validateTenantAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('different tenantId, user has access → sets req.tenantId, calls next()', async () => {
    const req = makeReq({ body: { tenantId: 'tenant-other' } });
    const res = makeRes();
    const next = jest.fn();

    mockSupabaseChain({ data: { id: 'some-id' }, error: null });

    await validateTenantAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-other');
  });

  test('different tenantId, user lacks access → 403', async () => {
    const req = makeReq({ body: { tenantId: 'tenant-other' } });
    const res = makeRes();
    const next = jest.fn();

    mockSupabaseChain({ data: null, error: null });

    await validateTenantAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acceso denegado a este tenant' });
  });

  test('DB error → 500', async () => {
    const req = makeReq({ body: { tenantId: 'tenant-other' } });
    const res = makeRes();
    const next = jest.fn();

    mockSupabaseChain({ data: null, error: { message: 'db error' } });

    await validateTenantAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('no userId on req → 401', async () => {
    const req = makeReq({ userId: undefined, body: { tenantId: 'tenant-other' } });
    const res = makeRes();
    const next = jest.fn();

    await validateTenantAccess(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getUserTenants', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns tenant list on success', async () => {
    const mockData = [
      { tenant_id: 'tenant-1', role: 'owner', tenants: { id: 'tenant-1', name: 'Test', subscriptions: [{ plan: 'inicial', status: 'active' }] } },
    ];
    const chain = {
      select: jest.fn(),
      eq: jest.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    chain.select.mockReturnValue(chain);
    supabase.from.mockReturnValue(chain);

    const result = await getUserTenants('user-1');

    expect(result).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('user_tenants');
  });

  test('returns empty array on DB error', async () => {
    const chain = {
      select: jest.fn(),
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    };
    chain.select.mockReturnValue(chain);
    supabase.from.mockReturnValue(chain);

    const result = await getUserTenants('user-1');
    expect(result).toEqual([]);
  });
});
