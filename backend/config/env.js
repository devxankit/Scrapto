import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

export const isProduction = () => process.env.NODE_ENV === 'production';
export const isTest = () => process.env.NODE_ENV === 'test';
export const isDevelopment = () => process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const MIN_SECRET_LENGTH = 32;

// Secrets that have appeared in source control / docs and must never be accepted.
const KNOWN_WEAK_SECRETS = new Set([
  'scrapto-dev-secret-key-change-in-production-2024',
  'secret',
  'changeme',
  'your-secret-key'
]);

const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'NODE_ENV'];

const productionRequiredEnvVars = [
  'KYC_ENCRYPTION_KEY',
  'OTP_HMAC_SECRET',
  'FRONTEND_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SMSINDIAHUB_API_KEY',
  'SMSINDIAHUB_SENDER_ID'
];

/**
 * Access-token signing secret. There is deliberately NO hardcoded fallback:
 * a missing secret is a fatal configuration error, never a silent downgrade.
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

/**
 * Refresh-token signing secret. Must be distinct from the access secret so an
 * access token can never be replayed as a refresh token (and vice versa).
 */
export const getJwtRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not configured');
  }
  return secret;
};

const secretProblems = (name, value) => {
  const problems = [];
  if (!value) return problems;
  if (KNOWN_WEAK_SECRETS.has(value)) problems.push(`${name} is a publicly known default value`);
  if (value.length < MIN_SECRET_LENGTH) {
    problems.push(`${name} is too short (${value.length} chars, minimum ${MIN_SECRET_LENGTH})`);
  }
  return problems;
};

/**
 * Validate environment variables. Fatal in production, loud warnings elsewhere.
 */
export const validateEnv = () => {
  const missing = requiredEnvVars.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const problems = [
    ...secretProblems('JWT_SECRET', process.env.JWT_SECRET),
    ...secretProblems('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET),
    ...secretProblems('OTP_HMAC_SECRET', process.env.OTP_HMAC_SECRET)
  ];

  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET must be different from JWT_SECRET');
  }

  if (process.env.KYC_ENCRYPTION_KEY) {
    const keyBytes = Buffer.from(process.env.KYC_ENCRYPTION_KEY, 'base64');
    if (keyBytes.length !== 32) {
      problems.push('KYC_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }
  }

  if (isProduction()) {
    const missingProd = productionRequiredEnvVars.filter((name) => !process.env[name]);
    if (missingProd.length > 0) {
      problems.push(`Missing production environment variables: ${missingProd.join(', ')}`);
    }
    if (process.env.OTP_TEST_NUMBERS) {
      problems.push('OTP_TEST_NUMBERS must not be set in production (fixed OTPs are disabled)');
    }
    if (process.env.OTP_DEBUG_LOG === 'true') {
      problems.push('OTP_DEBUG_LOG must not be enabled in production');
    }
    if (problems.length > 0) {
      const errorMsg = `Insecure production configuration: ${problems.join('; ')}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  } else if (problems.length > 0) {
    problems.forEach((p) => logger.warn(`[config] ${p}. This would be FATAL in production.`));
  }

  logger.info('Environment variables validated');
};

/**
 * Get environment variable with default value
 */
export const getEnv = (key, defaultValue = null) => {
  return process.env[key] || defaultValue;
};

export const getIntEnv = (key, defaultValue) => {
  const parsed = parseInt(process.env[key], 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export default {
  validateEnv,
  getEnv,
  getIntEnv,
  getJwtSecret,
  getJwtRefreshSecret,
  isProduction,
  isDevelopment,
  isTest
};
