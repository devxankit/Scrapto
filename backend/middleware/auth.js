import { USER_ROLES } from '../config/constants.js';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import { verifyAccessToken } from '../utils/generateToken.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware.
 *
 * Guarantees after `protect` succeeds:
 *  - the JWT is valid, unexpired, and of type "access";
 *  - the account still exists, is active, and has not revoked this token
 *    (tokenVersion match) — blocking a user kills existing sessions immediately;
 *  - req.user.role is the CURRENT database role, not whatever the token claims;
 *  - for scrappers, req.user.scrapper is the Scrapper profile (good standing
 *    is enforced by requireScrapperInGoodStanding where business rules demand it).
 */
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      error: expired ? 'Session expired. Please log in again.' : 'Not authorized to access this route',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
    });
  }

  try {
    const user = await User.findById(decoded.id).select('role isActive isPhoneVerified tokenVersion name email phone wallet.status');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact support.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Token revocation: block/unblock, password change, role change and
    // "log out everywhere" all bump tokenVersion.
    const tokenVersion = decoded.tv ?? 0;
    if ((user.tokenVersion || 0) !== tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Session is no longer valid. Please log in again.',
        code: 'TOKEN_REVOKED'
      });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role, // ALWAYS the database role
      name: user.name,
      email: user.email,
      phone: user.phone,
      isPhoneVerified: user.isPhoneVerified,
      walletStatus: user.wallet?.status || 'ACTIVE',
      tokenVersion: user.tokenVersion || 0
    };
    req.userDoc = user;

    if (user.role === USER_ROLES.SCRAPPER) {
      const scrapper = await Scrapper.findById(user._id);
      if (scrapper) {
        if (scrapper.status !== 'active') {
          return res.status(403).json({
            success: false,
            error: 'Your scrapper account is blocked or suspended. Please contact support.',
            code: 'SCRAPPER_BLOCKED'
          });
        }
        req.user.scrapperId = scrapper._id.toString();
        req.scrapper = scrapper;
      }
    }

    return next();
  } catch (error) {
    logger.error('Auth middleware failure', { error: error.message });
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'You are not authorized to access this route'
      });
    }

    next();
  };
};

/** Phone must be verified before using any business functionality. */
export const requireVerifiedPhone = (req, res, next) => {
  if (!req.user?.isPhoneVerified && req.user?.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({
      success: false,
      error: 'Please verify your phone number first.',
      code: 'PHONE_NOT_VERIFIED'
    });
  }
  next();
};

/**
 * For scrapper business actions: profile must exist, be active, and KYC-verified.
 * (protect already rejected blocked/suspended scrappers.)
 */
export const requireScrapperInGoodStanding = ({ requireKyc = true } = {}) => async (req, res, next) => {
  if (req.user?.role !== USER_ROLES.SCRAPPER) {
    return res.status(403).json({ success: false, error: 'Scrapper account required' });
  }
  const scrapper = req.scrapper;
  if (!scrapper) {
    return res.status(403).json({
      success: false,
      error: 'Scrapper profile not found. Please complete your profile.',
      code: 'SCRAPPER_PROFILE_MISSING'
    });
  }
  if (requireKyc && scrapper.kyc?.status !== 'verified') {
    return res.status(403).json({
      success: false,
      error: 'KYC verification required before performing this action.',
      code: 'KYC_NOT_VERIFIED'
    });
  }
  next();
};

// Role-specific middleware
export const isUser = authorize(USER_ROLES.USER);
export const isScrapper = authorize(USER_ROLES.SCRAPPER);
export const isAdmin = authorize(USER_ROLES.ADMIN);
