const crypto = require('crypto');
const { AppError } = require('../errors');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // tamaño recomendado para GCM
const KEY_BYTES = 32;  // AES-256

// Se resuelve perezosamente: env.js valida la presencia, pero los tests y los
// arranques sin facturación configurada no deben explotar al importar.
let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) throw new AppError('ENCRYPTION_KEY no está configurada', 500);

  // Acepta hex (64 chars) o base64.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new AppError(`ENCRYPTION_KEY debe ser de ${KEY_BYTES} bytes (hex o base64)`, 500);
  }

  cachedKey = key;
  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':');
}

function decrypt(payload) {
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new AppError('Payload cifrado inválido', 500);

  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  // .final() lanza si el authTag no valida — ese es el punto de GCM.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
