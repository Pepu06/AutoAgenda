/**
 * Tests for the AFIP verification QR. The payload shape is fixed by AFIP —
 * a wrong field name makes the QR resolve to nothing on their site.
 */

const { buildQrPayload, buildQrUrl } = require('../services/afip/comprobanteHtml');

const INVOICE = {
  cbteFecha: '2026-08-31',
  cbteTipo: 11,
  puntoVenta: 3,
  numero: 152,
  docTipo: 96,
  docNro: 30111222,
  impTotal: '1210.50',
  cae: '74512345678901',
  emisorSnapshot: { cuit: 20111111112, razonSocial: 'Mi Negocio' },
};

describe('buildQrPayload', () => {
  test('carries exactly the fields AFIP documents', () => {
    expect(buildQrPayload(INVOICE)).toEqual({
      ver: 1,
      fecha: '2026-08-31',
      cuit: 20111111112,
      ptoVta: 3,
      tipoCmp: 11,
      nroCmp: 152,
      importe: 1210.5,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 96,
      nroDocRec: 30111222,
      tipoCodAut: 'E',
      codAut: 74512345678901,
    });
  });

  test('sends the amount as a number, not a string', () => {
    expect(typeof buildQrPayload(INVOICE).importe).toBe('number');
  });

  test('sends the CAE as a number', () => {
    expect(buildQrPayload(INVOICE).codAut).toBe(74512345678901);
  });
});

describe('buildQrUrl', () => {
  test('points at the AFIP verification endpoint', () => {
    expect(buildQrUrl(INVOICE)).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
  });

  test('base64 payload decodes back to the original JSON', () => {
    const b64 = buildQrUrl(INVOICE).split('?p=')[1];
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(decoded).toEqual(buildQrPayload(INVOICE));
  });
});
