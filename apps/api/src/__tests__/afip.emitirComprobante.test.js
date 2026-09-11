/**
 * Tests for emitirComprobante — the last line of defense against ever
 * telling a user "tu factura se emitió" when AFIP actually rejected it. The
 * SDK resolves normally with cae: "" on rejection instead of throwing, so
 * assertAceptado() inside emitirComprobante is what catches that.
 */

// services/afip/index.js -> ticketStorage.js requires @autoagenda/db and
// ../../config/logger. Neither should touch a real Supabase client or the
// Zod-validated env (this worktree's .env fails that validation) in a test.
jest.mock('@autoagenda/db', () => ({
  supabase: {},
  convertKeys: (x) => x,
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockCreateNextVoucher = jest.fn();

jest.mock('@arcasdk/core', () => ({
  Arca: jest.fn().mockImplementation(() => ({
    electronicBillingService: {
      createNextVoucher: mockCreateNextVoucher,
    },
  })),
  AccessTicket: { create: jest.fn() },
}));

const { emitirComprobante } = require('../services/afip');
const { CBTE_TIPO } = require('../services/afip/buildVoucher');

const CONFIG = {
  tenantId: 'tenant-1',
  cuit: '20111111112',
  situacionFiscal: 'monotributo',
  puntoVenta: 3,
  production: false,
  cert: '-----BEGIN CERTIFICATE-----',
  key: '-----BEGIN PRIVATE KEY-----',
};

function baseInput(overrides = {}) {
  return {
    cbteTipo: CBTE_TIPO.C,
    total: 121,
    cbteFecha: new Date('2026-08-31T12:00:00Z'),
    servDesde: new Date('2026-08-31T12:00:00Z'),
    servHasta: new Date('2026-08-31T12:00:00Z'),
    vtoPago: new Date('2026-08-31T12:00:00Z'),
    ...overrides,
  };
}

async function captureRejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('emitirComprobante', () => {
  beforeEach(() => {
    mockCreateNextVoucher.mockReset();
  });

  test('rejects with AFIP\'s own code/message when cae is empty and Errors.Err is an array', async () => {
    mockCreateNextVoucher.mockResolvedValue({
      cae: '',
      response: {
        Errors: {
          Err: [{ Code: 10016, Msg: 'El numero de comprobante no se corresponde con el proximo a autorizar' }],
        },
      },
    });

    const err = await captureRejection(emitirComprobante(CONFIG, baseInput()));
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('10016');
    expect(err.message).toContain('proximo a autorizar');
  });

  test('still rejects cleanly (no TypeError) when Errors.Err arrives as a single object instead of an array', async () => {
    mockCreateNextVoucher.mockResolvedValue({
      cae: '',
      response: {
        Errors: { Err: { Code: 10015, Msg: 'CUIT del emisor no autorizado a facturar' } },
      },
    });

    const err = await captureRejection(emitirComprobante(CONFIG, baseInput()));
    expect(err).not.toBeInstanceOf(TypeError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('10015');
    expect(err.message).toContain('CUIT del emisor no autorizado a facturar');
  });

  test('falls back to a generic message — never the literal "undefined: undefined" — when nothing has a usable Code/Msg', async () => {
    mockCreateNextVoucher.mockResolvedValue({
      cae: '',
      response: {
        Errors: { Err: [{}] },
        FeDetResp: { FECAEDetResponse: [{ Observaciones: { Obs: [{}] } }] },
      },
    });

    const err = await captureRejection(emitirComprobante(CONFIG, baseInput()));
    expect(err.message).not.toContain('undefined: undefined');
    expect(err.message).toContain('sin detalle');
  });

  test('resolves with {cae, caeVto, numero, voucher} when AFIP accepts', async () => {
    mockCreateNextVoucher.mockResolvedValue({
      cae: '74512345678901',
      caeFchVto: '20260910',
      response: {
        FeDetResp: { FECAEDetResponse: [{ CbteDesde: 152 }] },
      },
    });

    const result = await emitirComprobante(CONFIG, baseInput());
    expect(result).toEqual({
      cae: '74512345678901',
      caeVto: '2026-09-10',
      numero: 152,
      voucher: expect.objectContaining({ PtoVta: 3, CbteTipo: CBTE_TIPO.C }),
    });
  });

  test('wraps a non-AFIP-business error (SDK/WSAA/network failure) as an actionable 502 AppError', async () => {
    mockCreateNextVoucher.mockRejectedValue(new Error('WSAA auth failed: ECONNREFUSED'));

    const err = await captureRejection(emitirComprobante(CONFIG, baseInput()));
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain('No se pudo conectar con AFIP');
    expect(err.message).toContain('ECONNREFUSED');
  });
});
