/**
 * Request sanitisation: defends against NoSQL operator injection and
 * prototype pollution by removing dangerous keys from body, query and params.
 *
 *  - keys starting with "$"      -> MongoDB operators ({ "$ne": null }, "$where", ...)
 *  - keys containing "."         -> dotted-path injection ("wallet.balance")
 *  - __proto__/constructor/prototype -> prototype pollution
 *
 * Query-string parameters are additionally required to be scalars for the
 * fields we filter on; arrays/objects are handled per-controller via pickEnum().
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 12;

const isUnsafeKey = (key) => key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key);

export const sanitizeValue = (value, depth = 0) => {
  if (depth > MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = sanitizeValue(value[i], depth + 1);
    }
    return value;
  }
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    for (const key of Object.keys(value)) {
      if (isUnsafeKey(key)) {
        delete value[key];
      } else {
        value[key] = sanitizeValue(value[key], depth + 1);
      }
    }
  }
  return value;
};

export const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeValue(req.params);
  }
  next();
};

export default sanitizeRequest;
