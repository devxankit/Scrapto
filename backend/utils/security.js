import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * Application error carrying an HTTP status. Thrown from services so that
 * controllers / the error handler can return a precise, safe response.
 */
export class AppError extends Error {
  constructor(message, statusCode = 400, code = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export const badRequest = (msg, code) => new AppError(msg, 400, code);
export const forbidden = (msg = 'Not authorized', code) => new AppError(msg, 403, code);
export const notFoundError = (msg = 'Resource not found', code) => new AppError(msg, 404, code);
export const conflict = (msg, code) => new AppError(msg, 409, code);

/** Escape user input before embedding it in a RegExp (prevents ReDoS / injection). */
export const escapeRegex = (input) => String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MAX_SEARCH_LENGTH = 64;

/**
 * Build a safe, bounded, case-insensitive "contains" matcher from user search input.
 * Returns null when the input is unusable.
 */
export const safeSearchRegex = (input) => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!trimmed) return null;
  return new RegExp(escapeRegex(trimmed), 'i');
};

/** Constant-time string comparison. */
export const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still burn comparable time, then fail.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

export const MAX_PAGE_LIMIT = 100;

/**
 * Parse and clamp pagination params. Never trusts raw query values.
 */
export const parsePagination = (query = {}, { defaultLimit = 10, maxLimit = MAX_PAGE_LIMIT } = {}) => {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 100000) page = 100000;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * Parse a date query param. Returns undefined when absent and throws a 400
 * AppError when present but invalid (instead of producing `Invalid Date`).
 */
export const parseDateParam = (value, name = 'date') => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw badRequest(`Invalid ${name}`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`Invalid ${name}`);
  return date;
};

/** Accept only plain strings from a fixed allow-list (blocks operator injection). */
export const pickEnum = (value, allowed) => {
  if (typeof value !== 'string') return undefined;
  return allowed.includes(value) ? value : undefined;
};

export const isValidObjectId = (value) =>
  typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value) && mongoose.Types.ObjectId.isValid(value);

export const assertObjectId = (value, name = 'id') => {
  if (!isValidObjectId(String(value || ''))) throw badRequest(`Invalid ${name}`);
  return String(value);
};

/** Coerce to a plain string or return undefined; never lets objects through. */
export const asString = (value, maxLength = 1000) => {
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, maxLength);
};

// ---------------------------------------------------------------------------
// Money helpers. Amounts are INR with 2 decimal places. All arithmetic is done
// in integer paise to avoid floating point drift.
// ---------------------------------------------------------------------------
export const MAX_MONEY_AMOUNT = 10_000_000; // ₹1 crore hard ceiling per operation

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const fromPaise = (paise) => Math.round(paise) / 100;

/**
 * Validate and normalise a money amount supplied by a client.
 * Rejects non-numbers, NaN/Infinity, negatives, zero (unless allowed),
 * more than 2 decimals, and absurd magnitudes.
 */
export const parseMoney = (value, { min = 0.01, max = MAX_MONEY_AMOUNT, name = 'amount' } = {}) => {
  if (typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    value = Number(value.trim());
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw badRequest(`Invalid ${name}`);
  }
  const paise = Math.round(value * 100);
  if (Math.abs(value * 100 - paise) > 1e-6) {
    throw badRequest(`Invalid ${name}: at most 2 decimal places are allowed`);
  }
  const amount = paise / 100;
  if (amount < min) throw badRequest(`Invalid ${name}: minimum is ₹${min}`);
  if (amount > max) throw badRequest(`Invalid ${name}: maximum is ₹${max}`);
  return amount;
};

export const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

export const randomId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

/** Collision-resistant, sortable transaction identifier. */
export const generateTrxId = (prefix = 'TRX') =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

export const getClientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
