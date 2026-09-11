/**
 * Tests for AFIP voucher assembly — the fiscal rules with real gotchas:
 * the Iva array only belongs on A/B, CondicionIVAReceptorId is mandatory on all
 * three, and DocTipo depends on which receptor id we were given.
 */

const { buildVoucher, toAfipDate, parseAfipDate, CBTE_TIPO } = require('../services/afip/buildVoucher');

const MONOTRIBUTO = { puntoVenta: 3, situacionFiscal: 'monotributo' };
const INSCRIPTO   = { puntoVenta: 3, situacionFiscal: 'responsable_inscripto' };

function baseInput(overrides = {}) {
  return {
    cbteTipo: CBTE_TIPO.C,
    total: 121,
    cbteFecha: new Date('2026-08-31T12:00:00Z'),
    servDesde: new Date('2026-08-31T12:00:00Z'),
    servHasta: new Date('2026-08-31T12:00:00Z'),
    vtoPago:   new Date('2026-08-31T12:00:00Z'),
    ...overrides,
  };
}

describe('toAfipDate / parseAfipDate', () => {
  test('formats a date as AAAAMMDD', () => {
    expect(toAfipDate(new Date('2026-08-31T12:00:00Z'))).toBe('20260831');
  });

  test('zero-pads single-digit months and days', () => {
    expect(toAfipDate(new Date('2026-01-05T12:00:00Z'))).toBe('20260105');
  });

  // El formato de CAEFchVto no es estable entre versiones del SDK.
  test('parses AAAAMMDD', () => {
    expect(parseAfipDate('20260910')).toBe('2026-09-10');
  });

  test('parses AAAA-MM-DD unchanged', () => {
    expect(parseAfipDate('2026-09-10')).toBe('2026-09-10');
  });

  test('rejects an unrecognized date format', () => {
    expect(() => parseAfipDate('10/09/2026')).toThrow();
  });
});

describe('factura C (monotributo)', () => {
  test('carries no Iva array and no VAT', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput({ total: 121 }));
    expect(v).not.toHaveProperty('Iva');
    expect(v.ImpNeto).toBe(121);
    expect(v.ImpIVA).toBe(0);
    expect(v.ImpTotal).toBe(121);
  });

  test('defaults to consumidor final', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.DocTipo).toBe(99);
    expect(v.DocNro).toBe(0);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('uses DocTipo 96 when a DNI is given', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput({ receptorDni: '30111222' }));
    expect(v.DocTipo).toBe(96);
    expect(v.DocNro).toBe(30111222);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('rejects a monotributista trying to issue an A', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ cbteTipo: CBTE_TIPO.A })))
      .toThrow(/monotributo/i);
  });
});

describe('factura A (responsable inscripto)', () => {
  test('breaks out 21% VAT and includes the Iva array', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({
      cbteTipo: CBTE_TIPO.A, total: 121, receptorCuit: '30111111118',
    }));
    expect(v.ImpNeto).toBe(100);
    expect(v.ImpIVA).toBe(21);
    expect(v.Iva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
  });

  test('maps a CUIT receptor to DocTipo 80 / responsable inscripto', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({
      cbteTipo: CBTE_TIPO.A, receptorCuit: '30111111118',
    }));
    expect(v.DocTipo).toBe(80);
    expect(v.DocNro).toBe(30111111118);
    expect(v.CondicionIVAReceptorId).toBe(1);
  });

  test('requires a CUIT — an A to consumidor final is not a thing', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.A })))
      .toThrow(/CUIT/i);
  });

  test('rejects a malformed CUIT', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.A, receptorCuit: '123' })))
      .toThrow(/CUIT/i);
  });

  test('net plus VAT always equals the total', () => {
    for (const total of [100, 121, 1500.5, 33.33, 0.03]) {
      const v = buildVoucher(INSCRIPTO, baseInput({
        cbteTipo: CBTE_TIPO.A, total, receptorCuit: '30111111118',
      }));
      expect(v.ImpNeto + v.ImpIVA).toBeCloseTo(v.ImpTotal, 2);
    }
  });
});

describe('factura B (responsable inscripto a consumidor final)', () => {
  test('breaks out VAT but stays consumidor final', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.B, total: 121 }));
    expect(v.Iva).toEqual([{ Id: 5, BaseImp: 100, Importe: 21 }]);
    expect(v.DocTipo).toBe(99);
    expect(v.CondicionIVAReceptorId).toBe(5);
  });

  test('accepts an optional DNI', () => {
    const v = buildVoucher(INSCRIPTO, baseInput({ cbteTipo: CBTE_TIPO.B, receptorDni: '30111222' }));
    expect(v.DocTipo).toBe(96);
    expect(v.DocNro).toBe(30111222);
  });

  test('rejects a B from a monotributista', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ cbteTipo: CBTE_TIPO.B })))
      .toThrow(/monotributo/i);
  });
});

describe('campos comunes', () => {
  test('always sets Concepto 2 with the three service dates', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.Concepto).toBe(2);
    expect(v.FchServDesde).toBe('20260831');
    expect(v.FchServHasta).toBe('20260831');
    expect(v.FchVtoPago).toBe('20260831');
  });

  test('sets the fixed WSFE fields', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v.CantReg).toBe(1);
    expect(v.PtoVta).toBe(3);
    expect(v.MonId).toBe('PES');
    expect(v.MonCotiz).toBe(1);
    expect(v.ImpTotConc).toBe(0);
    expect(v.ImpOpEx).toBe(0);
    expect(v.ImpTrib).toBe(0);
  });

  test('leaves numbering to createNextVoucher', () => {
    const v = buildVoucher(MONOTRIBUTO, baseInput());
    expect(v).not.toHaveProperty('CbteDesde');
    expect(v).not.toHaveProperty('CbteHasta');
  });

  test('rejects a non-positive total', () => {
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ total: 0 }))).toThrow(/monto/i);
    expect(() => buildVoucher(MONOTRIBUTO, baseInput({ total: -5 }))).toThrow(/monto/i);
  });

  test('rejects an unknown voucher type', () => {
    expect(() => buildVoucher(INSCRIPTO, baseInput({ cbteTipo: 99 }))).toThrow();
  });
});
