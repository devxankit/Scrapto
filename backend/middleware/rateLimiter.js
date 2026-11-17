import rateLimit from 'express-rate-limit';

const intEnv = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Load tests / the automated suite can raise limits explicitly; production never sets this.
const scale = () => {
  const factor = parseInt(process.env.RATE_LIMIT_SCALE, 10);
  return process.env.NODE_ENV !== 'production' && Number.isFinite(factor) && factor > 0 ? factor : 1;
};

const limited = (message) => ({ success: false, error: message, message });

const ipKey = (req) => req.ip || 'unknown';

const phoneOf = (req) => (typeof req.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '').slice(-10) : '');
const emailOf = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 100) : '');

const build = (options) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...options,
    max: typeof options.max === 'function' ? options.max : () => options.max * scale()
  });

/**
 * Global limiter. There is NO role- or path-based bypass: an "admin" claim in a
 * token or an /admin URL never exempts a client from throttling.
 */
export const rateLimiter = build({
  windowMs: intEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max: intEnv('RATE_LIMIT_MAX_REQUESTS', 1000),
  message: limited('Too many requests from this IP, please try again later.')
});

/** Authenticated admin panel traffic (applied after the global limiter). */
export const adminRateLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: limited('Too many requests, please try again later.')
});

/**
 * Password login: per-IP and per-account (email) limits. No keyword-based skip.
 * Successful logins do not count against the budget.
 */
export const authRateLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: limited('Too many login attempts, please try again later.')
});

export const loginAccountLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${emailOf(req) || ipKey(req)}`,
  message: limited('Too many login attempts for this account, please try again later.')
});

/** Registration: bounded per IP. */
export const registerRateLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: limited('Too many registration attempts, please try again later.')
});

/** OTP send / resend: per IP and per destination phone (SMS-bombing defence). */
export const otpSendIpLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limited('Too many OTP requests, please try again later.')
});

export const otpSendPhoneLimiter = build({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `otp-send:${phoneOf(req) || ipKey(req)}`,
  message: limited('Too many OTP requests for this number, please try again later.')
});

/** OTP verification: per IP and per phone (brute-force defence, in addition to per-OTP attempt caps). */
export const otpVerifyIpLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: limited('Too many verification attempts, please try again later.')
});

export const otpVerifyPhoneLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `otp-verify:${phoneOf(req) || ipKey(req)}`,
  message: limited('Too many verification attempts for this number, please try again later.')
});

export const refreshRateLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: limited('Too many token refresh attempts, please try again later.')
});

/** Money-moving endpoints (recharge, pay, withdraw, verify). Keyed per user when authenticated. */
export const financialRateLimiter = build({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `fin:${req.user?.id || ipKey(req)}`,
  message: limited('Too many payment requests, please slow down.')
});

/** File uploads. */
export const uploadRateLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `upload:${req.user?.id || ipKey(req)}`,
  message: limited('Too many uploads, please try again later.')
});

/** Public, unauthenticated, cost-bearing endpoints (translation proxy). */
export const translateRateLimiter = build({
  windowMs: 60 * 1000,
  max: 60,
  message: limited('Too many translation requests, please slow down.')
});

/** Webhooks: generous, but bounded. */
export const webhookRateLimiter = build({
  windowMs: 60 * 1000,
  max: 300,
  message: limited('Too many requests')
});
