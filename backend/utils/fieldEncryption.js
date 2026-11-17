import crypto from 'crypto';
import { AppError } from './security.js';

/**
 * Application-layer encryption for highly sensitive fields (Aadhaar numbers).
 *
 * Format:  enc:v1:<keyId>:<iv b64>:<authTag b64>:<ciphertext b64>
 * Cipher:  AES-256-GCM (authenticated; tampering is detected on decrypt)
 *
 * Key management:
 *   KYC_ENCRYPTION_KEY           base64 of 32 random bytes (current key)
 *   KYC_ENCRYPTION_KEY_ID        short label for the current key (default "k1")
 *   KYC_ENCRYPTION_OLD_KEYS      optional "id:base64,id:base64" list used only
 *                                for decryption during key rotation
 */
const PREFIX = 'enc:v1:';

const decodeKey = (b64, label) => {
  const key = Buffer.from(b64 || '', 'base64');
  if (key.length !== 32) {
    throw new AppError(`${label} must be a base64-encoded 32-byte key`, 503, 'ENCRYPTION_NOT_CONFIGURED');
  }
  return key;
};

const getCurrentKey = () => {
  if (!process.env.KYC_ENCRYPTION_KEY) {
    throw new AppError('KYC encryption key is not configured', 503, 'ENCRYPTION_NOT_CONFIGURED');
  }
  return {
    id: process.env.KYC_ENCRYPTION_KEY_ID || 'k1',
    key: decodeKey(process.env.KYC_ENCRYPTION_KEY, 'KYC_ENCRYPTION_KEY')
  };
};

const getKeyById = (keyId) => {
  const current = getCurrentKey();
  if (current.id === keyId) return current.key;
  const old = (process.env.KYC_ENCRYPTION_OLD_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of old) {
    const idx = entry.indexOf(':');
    if (idx > 0 && entry.slice(0, idx) === keyId) {
      return decodeKey(entry.slice(idx + 1), `KYC_ENCRYPTION_OLD_KEYS[${keyId}]`);
    }
  }
  throw new AppError('No decryption key available for this record', 500, 'ENCRYPTION_KEY_MISSING');
};

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

export const encryptField = (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const { id, key } = getCurrentKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${id}:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
};

export const decryptField = (value) => {
  if (!isEncrypted(value)) return value; // legacy plaintext (pre-migration)
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 4) {
    throw new AppError('Malformed encrypted value', 500, 'ENCRYPTION_MALFORMED');
  }
  const [keyId, ivB64, tagB64, dataB64] = parts;
  const key = getKeyById(keyId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
};

// ---------------------------------------------------------------------------
// Aadhaar helpers
// ---------------------------------------------------------------------------
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export const verhoeffValid = (digits) => {
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i += 1) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
};

/** Normalise an Aadhaar number to 12 digits or return null when structurally invalid. */
export const normalizeAadhaar = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const digits = String(input).replace(/[\s-]/g, '');
  if (!/^[2-9]\d{11}$/.test(digits)) return null;
  // Checksum enforcement is configurable because some legacy test data is not checksum-valid.
  if (process.env.AADHAAR_ENFORCE_CHECKSUM !== 'false' && !verhoeffValid(digits)) return null;
  return digits;
};

export const maskAadhaar = (last4) => (last4 ? `XXXX-XXXX-${last4}` : null);

/** Keyed hash (HMAC-SHA256) used for OTP storage and similar short secrets. */
export const hmacSha256 = (value, secret) =>
  crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
