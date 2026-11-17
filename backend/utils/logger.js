import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keys whose values must never reach a log sink.
const SENSITIVE_KEY = /pass(word)?|otp|token|secret|authorization|cookie|aadhaar|signature|api[_-]?key|private[_-]?key|accountNumber|account_number|ifsc|upi|cvv|card/i;
const MAX_DEPTH = 6;

const redactValue = (value, depth, seen) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Mask anything that looks like a bearer JWT embedded in free text.
    return value.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]');
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactValue(value.message, depth, seen), stack: value.stack };
  }
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}b]`;
  if (depth >= MAX_DEPTH || seen.has(value)) return '[Truncated]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1, seen));
  // Mongoose documents / ObjectIds: use their plain representation.
  if (typeof value.toHexString === 'function') return value.toHexString();
  const plain = typeof value.toObject === 'function' ? value.toObject() : value;
  const out = {};
  for (const key of Object.keys(plain)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactValue(plain[key], depth + 1, seen);
  }
  return out;
};

export const redact = (value) => redactValue(value, 0, new WeakSet());

const redactFormat = winston.format((info) => {
  const seen = new WeakSet();
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'timestamp' || key === 'service') continue;
    if (key !== 'message' && SENSITIVE_KEY.test(key)) {
      info[key] = '[REDACTED]';
    } else {
      info[key] = redactValue(info[key], 0, seen);
    }
  }
  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  redactFormat(),
  winston.format.json()
);

const isTestEnv = process.env.NODE_ENV === 'test';

const transports = [];
if (!isTestEnv) {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'info'),
  format: logFormat,
  defaultMeta: { service: 'scrapto-backend' },
  transports,
  silent: isTestEnv && process.env.TEST_LOGS !== 'true'
});

// Always log to stdout/stderr: containers and PaaS hosts collect from there.
if (!isTestEnv || process.env.TEST_LOGS === 'true') {
  logger.add(
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? logFormat
          : winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
  );
}

if (logger.transports.length === 0) {
  // winston warns when there are no transports; add a silent sink for tests.
  logger.add(new winston.transports.Console({ silent: true }));
}

export default logger;
