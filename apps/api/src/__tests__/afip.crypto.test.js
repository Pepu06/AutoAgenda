/**
 * Tests for AES-256-GCM cert/key encryption at rest.
 */

// 32 bytes en hex — clave de prueba, no se usa en ningún entorno real.
process.env.ENCRYPTION_KEY = '0'.repeat(64);

const { encrypt, decrypt } = require('../utils/crypto');
const { AppError } = require('../errors');

describe('encrypt/decrypt', () => {
  test('round-trips a value unchanged', () => {
    const secret = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  test('produces a different ciphertext each time (random IV)', () => {
    const a = encrypt('mismo texto');
    const b = encrypt('mismo texto');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test('output has three base64 parts', () => {
    const parts = encrypt('x').split(':');
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(Buffer.from(p, 'base64').length).toBeGreaterThan(0);
    }
  });

  test('rejects a tampered ciphertext instead of returning garbage', () => {
    const [iv, tag, ct] = encrypt('secreto').split(':');
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    const tampered = `${iv}:${tag}:${flipped.toString('base64')}`;
    // El módulo crypto tira un error nativo (auth tag inválido) — se traduce
    // a AppError para que el caller nunca vea el tipo nativo.
    expect(() => decrypt(tampered)).toThrow(AppError);
    expect(() => decrypt(tampered)).toThrow(/No se pudo descifrar/);
  });

  test('rejects a malformed payload', () => {
    expect(() => decrypt('no-tiene-formato')).toThrow(AppError);
  });

  test('accepts a base64 key as well as hex', () => {
    jest.resetModules();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const b64 = require('../utils/crypto');
    expect(b64.decrypt(b64.encrypt('hola'))).toBe('hola');
  });
});
