import crypto from 'crypto';
import smsIndiaHubService from '../services/smsIndiaHubService.js';
import logger from './logger.js';
import { hmacSha256 } from './fieldEncryption.js';
import { isProduction } from '../config/env.js';

/**
 * OTP lifecycle rules (enforced against the user/scrapper document):
 *  - 6 random digits (crypto.randomInt, not Math.random)
 *  - stored ONLY as HMAC-SHA256(phone:otp) — plaintext never persisted or logged
 *  - 10 minute expiry
 *  - single use: cleared on successful verification
 *  - max 5 wrong attempts per issued OTP, then it is invalidated
 *  - resend throttling: >=60s between sends, <=5 sends per rolling hour
 *    (route-level per-IP and per-phone limiters apply on top)
 *
 * Test numbers: OUTSIDE production only, numbers listed in OTP_TEST_NUMBERS
 * ("9999999999:123456,8888888888:123456") accept their fixed code. In
 * production config validation rejects OTP_TEST_NUMBERS entirely.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_SENDS_PER_HOUR = 5;

const otpSecret = () => {
  const secret = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OTP_HMAC_SECRET is not configured');
  return secret;
};

export const hashOtp = (phone, otp) => hmacSha256(`${phone}:${otp}`, otpSecret());

export const generateOtpCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

// Production ignores OTP_TEST_NUMBERS unless explicitly opted in (temporary,
// e.g. while the SMS sender ID is pending approval). Remove the flag after.
export const testNumbersAllowedInProduction = () =>
  process.env.OTP_TEST_NUMBERS_IN_PRODUCTION === 'true';

const parseTestNumbers = () => {
  if (isProduction() && !testNumbersAllowedInProduction()) return new Map();
  const raw = process.env.OTP_TEST_NUMBERS || '';
  const map = new Map();
  for (const entry of raw.split(',')) {
    const [phone, code] = entry.split(':').map((s) => s && s.trim());
    if (phone && code && /^\d{10}$/.test(phone) && /^\d{6}$/.test(code)) {
      map.set(phone, code);
    }
  }
  return map;
};

export const getTestOtp = (phone) => parseTestNumbers().get(phone) || null;
export const isTestNumber = (phone) => parseTestNumbers().has(phone);

/**
 * Issue a new OTP on `account` (a User document with OTP fields selected).
 * Mutates the document; caller saves. Returns the plaintext code to send.
 * Throws { statusCode, message } on throttle violations.
 */
export const issueOtp = (account, phone, now = new Date()) => {
  if (account.otpLastSentAt && now - account.otpLastSentAt < OTP_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - account.otpLastSentAt)) / 1000);
    const err = new Error(`Please wait ${waitSec}s before requesting another OTP`);
    err.statusCode = 429;
    throw err;
  }
  const windowStart = account.otpSendWindowStart;
  if (!windowStart || now - windowStart > 60 * 60 * 1000) {
    account.otpSendWindowStart = now;
    account.otpSendCount = 0;
  }
  if (!isTestNumber(phone) && (account.otpSendCount || 0) >= OTP_MAX_SENDS_PER_HOUR) {
    const err = new Error('OTP request limit reached. Please try again later.');
    err.statusCode = 429;
    throw err;
  }

  const code = getTestOtp(phone) || generateOtpCode();
  account.phoneVerificationOTP = hashOtp(phone, code);
  account.otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
  account.otpAttempts = 0;
  account.otpLastSentAt = now;
  account.otpSendCount = (account.otpSendCount || 0) + 1;
  return code;
};

/**
 * Check a submitted OTP against the stored hash. Mutates attempt counters and
 * clears the OTP on success (single use). Caller saves the document.
 * Returns { ok: boolean, reason?: string }
 */
export const checkOtp = (account, phone, submitted, now = new Date()) => {
  if (!account.phoneVerificationOTP || !account.otpExpiresAt) {
    return { ok: false, reason: 'No OTP requested. Please request a new OTP.' };
  }
  if (account.otpExpiresAt < now) {
    account.phoneVerificationOTP = null;
    account.otpExpiresAt = null;
    return { ok: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if ((account.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    account.phoneVerificationOTP = null;
    account.otpExpiresAt = null;
    return { ok: false, reason: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  const expected = account.phoneVerificationOTP;
  const actual = hashOtp(phone, String(submitted));
  const match =
    expected.length === actual.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));

  if (!match) {
    account.otpAttempts = (account.otpAttempts || 0) + 1;
    const remaining = OTP_MAX_ATTEMPTS - account.otpAttempts;
    if (remaining <= 0) {
      account.phoneVerificationOTP = null;
      account.otpExpiresAt = null;
      return { ok: false, reason: 'Too many incorrect attempts. Please request a new OTP.' };
    }
    return { ok: false, reason: 'Invalid OTP' };
  }

  // Single use
  account.phoneVerificationOTP = null;
  account.otpExpiresAt = null;
  account.otpAttempts = 0;
  return { ok: true };
};

/**
 * Send OTP via SMS. Never logs the code. For configured test numbers the SMS
 * send is skipped (non-production only).
 */
export const sendOTP = async (phone, otp) => {
  if (isTestNumber(phone)) {
    logger.info(`[otp] Test number ${phone.slice(-4).padStart(10, '*')}: SMS send skipped`);
    return { success: true, skipped: true };
  }
  try {
    const result = await smsIndiaHubService.sendOTP(phone, otp);
    logger.info('[otp] SMS dispatched', { phoneSuffix: phone.slice(-4) });
    return result;
  } catch (error) {
    logger.error('[otp] SMS send failed', { error: error.message, phoneSuffix: phone.slice(-4) });
    throw new Error('SMS sending failed');
  }
};

export const sendWelcomeSMS = async (phone, name) => {
  try {
    const message = `Welcome to Scrapto, ${name}! Your account has been successfully created. Start managing your scrap orders and connect with verified scrappers.`;
    return await smsIndiaHubService.sendCustomSMS(phone, message);
  } catch (error) {
    logger.error('Error sending welcome SMS:', { error: error.message });
    throw error;
  }
};

export const sendOrderConfirmationSMS = async (phone, orderId, amount) => {
  try {
    const message = `Your scrap order #${orderId} has been confirmed. Total amount: ₹${amount}. Our scrapper will contact you soon for pickup.`;
    return await smsIndiaHubService.sendCustomSMS(phone, message);
  } catch (error) {
    logger.error('Error sending order confirmation SMS:', { error: error.message });
    throw error;
  }
};

export const getSMSBalance = async () => smsIndiaHubService.getBalance();
export const testSMSConnection = async () => smsIndiaHubService.testConnection();
