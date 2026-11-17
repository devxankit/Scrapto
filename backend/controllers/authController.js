import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { generateToken, generateRefreshToken, verifyRefreshToken, newRefreshId } from '../utils/generateToken.js';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import { issueOtp, checkOtp, sendOTP, isTestNumber } from '../utils/otpService.js';
import logger from '../utils/logger.js';
import { USER_ROLES } from '../config/constants.js';
import { isProduction } from '../config/env.js';
import { asString } from '../utils/security.js';

const OTP_SELECT = '+phoneVerificationOTP +otpExpiresAt +otpAttempts +otpLastSentAt +otpSendWindowStart +otpSendCount';
const LOCK_SELECT = '+failedLoginAttempts +lockUntil';
const MAX_LOGIN_FAILURES = 8;
const LOCK_MINUTES = 15;

/**
 * Only non-privileged roles may ever be self-assigned. 'admin' is NOT in this
 * list: admin accounts are provisioned exclusively via scripts/createAdmin.js
 * run by the operator. Any other value (including objects — NoSQL injection)
 * is rejected by the validator before reaching here; this is defence in depth.
 */
const SELF_ASSIGNABLE_ROLES = new Set([USER_ROLES.USER, USER_ROLES.SCRAPPER]);

const VEHICLE_TYPES = new Set(['bike', 'auto', 'truck']);
/** The vehicle a partner picks at sign-up, validated; null when unusable. */
const sanitizeVehicle = (v) => {
  if (!v || typeof v !== 'object' || !VEHICLE_TYPES.has(v.type)) return null;
  const number = typeof v.number === 'string' ? v.number.trim().toUpperCase().slice(0, 20) : '';
  if (!number) return null;
  const capacity = Number(v.capacity);
  return { type: v.type, number, capacity: Number.isFinite(capacity) && capacity >= 0 && capacity <= 100000 ? capacity : 0 };
};

const MAX_REFRESH_SESSIONS = 10;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Issues an access token and a single-use refresh token, recording the refresh
 * token's id on the account (most recent ${MAX_REFRESH_SESSIONS} devices kept).
 */
const issueSession = async (user) => {
  const jti = newRefreshId();
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshSessions: { $each: [{ jti, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) }], $slice: -MAX_REFRESH_SESSIONS } } }
  );
  return {
    token: generateToken(user._id, user.role, user.tokenVersion || 0),
    refreshToken: generateRefreshToken(user._id, user.tokenVersion || 0, jti)
  };
};

const sendOtpOrFail = async (res, user, phone, context) => {
  let code;
  try {
    code = issueOtp(user, phone);
  } catch (err) {
    await user.save();
    return { failed: true, response: sendError(res, err.message, err.statusCode || 429) };
  }
  await user.save();

  try {
    await sendOTP(phone, code);
  } catch {
    if (isProduction()) {
      return { failed: true, response: sendError(res, 'Failed to send OTP. Please try again.', 502) };
    }
    logger.warn(`[auth] SMS failed in ${context}; continuing in non-production`);
  }
  return { failed: false };
};

// @desc    Register user or scrapper (never admin)
// @route   POST /api/v1/auth/register
// @access  Public
export const register = asyncHandler(async (req, res) => {
  const name = asString(req.body.name, 50);
  const email = asString(req.body.email, 254)?.toLowerCase();
  const phone = asString(req.body.phone, 15);
  const referralCode = asString(req.body.referralCode, 20);
  const city = asString(req.body.city, 80);

  // Role: strictly from the allow-list. Admin self-registration is impossible.
  const requestedRole = typeof req.body.role === 'string' ? req.body.role : USER_ROLES.USER;
  if (!SELF_ASSIGNABLE_ROLES.has(requestedRole)) {
    return sendError(res, 'Invalid role', 400);
  }
  const userRole = requestedRole;

  // Validate referral code if provided
  let referrerId = null;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) {
      return sendError(res, 'Invalid referral code', 400);
    }
    referrerId = referrer._id;
  }

  // Cross-role duplicate checks
  if (userRole === USER_ROLES.USER) {
    const scrapperExists = await Scrapper.findOne({ phone });
    if (scrapperExists) {
      return sendError(res, 'This phone number is already registered as a scrapper. Please use a different number or login as scrapper.', 400);
    }
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return sendError(res, 'User already exists with this email or phone', 400);
    }
  } else {
    const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
    if (existingUser) {
      if (existingUser.role === USER_ROLES.USER) {
        return sendError(res, 'This phone number is already registered as a user. Please use a different number or login as user.', 400);
      }
      return sendError(res, 'This account is already registered. Please login to continue.', 400);
    }
    const scrapperExists = await Scrapper.findOne({ phone });
    if (scrapperExists) {
      return sendError(res, 'This phone number is already registered as a scrapper. Please login to continue.', 400);
    }
  }

  // Users/scrappers are OTP-only: any client-supplied password is ignored.
  const user = await User.create({
    name,
    email,
    phone,
    role: userRole,
    referredBy: referrerId
  });

  if (userRole === USER_ROLES.SCRAPPER) {
    try {
      await Scrapper.create({
        _id: user._id, // keep scrapper id in sync with user id
        phone,
        name,
        email,
        city: city || null,
        services: Array.isArray(req.body.services)
          ? req.body.services.filter((s) => ['scrap_pickup', 'home_cleaning'].includes(s))
          : ['scrap_pickup'],
        // Keep the vehicle chosen at sign-up (it used to be discarded).
        vehicleInfo: sanitizeVehicle(req.body.vehicleInfo) || { type: 'bike', number: 'NA', capacity: 0 },
        kyc: { status: 'not_submitted' } // KYC starts unverified — admin must approve
      });
    } catch (scrapperError) {
      // Registration must not half-complete: roll the user back.
      await User.deleteOne({ _id: user._id });
      logger.error('Failed to create scrapper profile during registration', { error: scrapperError.message });
      return sendError(res, 'Registration failed. Please try again.', 500);
    }
  }

  const result = await sendOtpOrFail(res, user, phone, 'register');
  if (result.failed) {
    // OTP could not be issued/sent: remove the account so the user can retry cleanly.
    await Scrapper.deleteOne({ _id: user._id }).catch(() => {});
    await User.deleteOne({ _id: user._id }).catch(() => {});
    return result.response;
  }

  // SECURITY: no session token before phone verification. The client gets the
  // user profile for display and must verify the OTP to obtain a token.
  sendSuccess(res, 'Registered successfully. Please verify your phone number with the OTP sent.', {
    user: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role },
    otpSent: true,
    requiresVerification: true
  }, 201);
});

// @desc    Password login (admin accounts only)
// @route   POST /api/v1/auth/login
// @access  Public
export const login = asyncHandler(async (req, res) => {
  const email = asString(req.body.email, 254)?.toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const user = await User.findOne({ email }).select(`+password ${LOCK_SELECT}`);
  if (!user || !user.password) {
    // Same message whether the account exists or not.
    return sendError(res, 'Invalid credentials', 401);
  }

  if (!user.isActive) {
    return sendError(res, 'Account is deactivated', 403);
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return sendError(res, `Account temporarily locked. Try again in ${mins} minute(s).`, 423);
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_FAILURES) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    return sendError(res, 'Invalid credentials', 401);
  }

  if (user.failedLoginAttempts || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
  }

  // Only admins use password login; users/scrappers are OTP-only.
  if (user.role !== USER_ROLES.ADMIN) {
    return sendError(res, 'Please use OTP login for this account', 400);
  }

  const { token, refreshToken } = await issueSession(user);

  logger.info('[auth] Admin login', { userId: user._id.toString() });

  sendSuccess(res, 'Login successful', {
    user: user.toObject(),
    token,
    refreshToken
  });
});

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return sendError(res, 'User not found', 404);

  const userData = user.toObject();
  if (user.role === USER_ROLES.SCRAPPER) {
    const scrapper = await Scrapper.findById(user._id);
    if (scrapper) {
      userData.scrapperProfile = scrapper.toObject();
    }
  }

  sendSuccess(res, 'User retrieved successfully', { user: userData });
});

// @desc    Update own profile (name / address only — never role, phone, email, wallet)
// @route   PUT /api/v1/auth/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res) => {
  const updates = {};
  const name = asString(req.body.name, 50);
  if (name) updates.name = name;

  if (req.body.address && typeof req.body.address === 'object' && !Array.isArray(req.body.address)) {
    const a = req.body.address;
    updates.address = {
      street: asString(a.street, 200),
      city: asString(a.city, 80),
      state: asString(a.state, 80),
      pincode: asString(a.pincode, 10),
      coordinates: a.coordinates && typeof a.coordinates === 'object'
        ? { lat: Number(a.coordinates.lat) || undefined, lng: Number(a.coordinates.lng) || undefined }
        : undefined
    };
  }

  if (Object.keys(updates).length === 0) {
    return sendError(res, 'No valid fields to update', 400);
  }

  const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true });
  if (!user) return sendError(res, 'User not found', 404);

  // Keep scrapper profile name in sync
  if (updates.name && user.role === USER_ROLES.SCRAPPER) {
    await Scrapper.updateOne({ _id: user._id }, { $set: { name: updates.name } });
  }

  sendSuccess(res, 'Profile updated successfully', { user: user.toObject() });
});

// @desc    Verify OTP (registration or login). Never changes the account role.
// @route   POST /api/v1/auth/verify-otp
// @access  Public
export const verifyOTP = asyncHandler(async (req, res) => {
  const phone = asString(req.body.phone, 15);
  const otp = asString(req.body.otp, 6);
  const requestedRole = typeof req.body.role === 'string' && SELF_ASSIGNABLE_ROLES.has(req.body.role)
    ? req.body.role
    : null;

  const user = await User.findOne({ phone }).select(OTP_SELECT);
  if (!user) {
    return sendError(res, 'Invalid or expired OTP', 400);
  }

  // Cross-portal guard: the stored role decides. A role mismatch is an error —
  // it NEVER rewrites the account role (that was a privilege-escalation hole).
  if (requestedRole && user.role !== requestedRole) {
    const portal = user.role === USER_ROLES.SCRAPPER ? 'scrapper' : 'user';
    return sendError(res, `This phone number is registered as a ${portal}. Please login from the ${portal} portal.`, 400);
  }

  if (!user.isActive) {
    return sendError(res, 'Account is deactivated. Please contact support.', 403);
  }

  const result = checkOtp(user, phone, otp);
  await user.save();
  if (!result.ok) {
    return sendError(res, result.reason, 400);
  }

  if (!user.isPhoneVerified) {
    user.isPhoneVerified = true;
    user.isVerified = true;
    await user.save();
    await Scrapper.updateOne({ _id: user._id }, { $set: { isPhoneVerified: true } }).catch(() => {});
  }

  const { token, refreshToken } = await issueSession(user);

  const userData = user.toObject();
  if (user.role === USER_ROLES.SCRAPPER) {
    const scrapperProfile = await Scrapper.findById(user._id);
    if (scrapperProfile) {
      userData.scrapperProfile = scrapperProfile.toObject();
    }
  }

  sendSuccess(res, 'OTP verified successfully', {
    user: userData,
    token,
    refreshToken
  });
});

// @desc    Resend OTP
// @route   POST /api/v1/auth/resend-otp
// @access  Public
export const resendOTP = asyncHandler(async (req, res) => {
  const phone = asString(req.body.phone, 15);

  const user = await User.findOne({ phone }).select(OTP_SELECT);
  if (!user || !user.isActive) {
    // Do not reveal whether the number exists.
    return sendSuccess(res, 'If this number is registered, an OTP has been sent.', { otpSent: true });
  }

  const result = await sendOtpOrFail(res, user, phone, 'resend');
  if (result.failed) return result.response;

  sendSuccess(res, 'OTP resent successfully', { otpSent: true });
});

// @desc    Send OTP for passwordless login
// @route   POST /api/v1/auth/login-otp
// @access  Public
export const sendLoginOTP = asyncHandler(async (req, res) => {
  const phone = asString(req.body.phone, 15);
  const requestedRole = typeof req.body.role === 'string' && SELF_ASSIGNABLE_ROLES.has(req.body.role)
    ? req.body.role
    : USER_ROLES.USER;

  const user = await User.findOne({ phone }).select(OTP_SELECT);

  if (!user) {
    return sendError(res, 'User not found with this phone number', 404);
  }

  if (user.role === USER_ROLES.ADMIN) {
    // Admins must use password login; no OTP issuance for admin accounts.
    return sendError(res, 'User not found with this phone number', 404);
  }

  if (user.role !== requestedRole) {
    const portal = user.role === USER_ROLES.SCRAPPER ? 'scrapper' : 'user';
    return sendError(res, `This phone number is registered as a ${portal}. Please login from the ${portal} portal.`, 400);
  }

  if (!user.isActive) {
    return sendError(res, 'Account is deactivated. Please contact support.', 403);
  }

  const result = await sendOtpOrFail(res, user, phone, 'login-otp');
  if (result.failed) return result.response;

  sendSuccess(res, 'Login OTP sent successfully', { otpSent: true });
});

// @desc    Refresh JWT token (rotates the refresh token)
// @route   POST /api/v1/auth/refresh-token
// @access  Public (requires valid refresh token)
export const refreshToken = asyncHandler(async (req, res) => {
  const token = typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null;

  if (!token) {
    return sendError(res, 'Refresh token is required', 400);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return sendError(res, 'Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    return sendError(res, 'Invalid or expired refresh token', 401);
  }
  if ((user.tokenVersion || 0) !== (decoded.tv ?? 0)) {
    return sendError(res, 'Session is no longer valid. Please log in again.', 401);
  }

  // Single use: atomically consume this token's id. Losing the race, or
  // presenting an id that was already consumed, means the token was replayed
  // (stolen or leaked) - revoke every session for the account.
  // Tokens issued before ids existed (no jti) are accepted once and migrated.
  if (decoded.jti) {
    const consumed = await User.updateOne(
      { _id: user._id, 'refreshSessions.jti': decoded.jti },
      { $pull: { refreshSessions: { jti: decoded.jti } } }
    );
    if (consumed.modifiedCount !== 1) {
      await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 }, $set: { refreshSessions: [] } });
      return res.status(401).json({ success: false, message: 'Session is no longer valid. Please log in again.', code: 'REFRESH_TOKEN_REUSED' });
    }
  }

  const session = await issueSession(user);

  sendSuccess(res, 'Token refreshed successfully', {
    token: session.token,
    refreshToken: session.refreshToken
  });
});

// @desc    Log out of all sessions (revokes every outstanding token)
// @route   POST /api/v1/auth/logout-all
// @access  Private
export const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 }, $set: { refreshSessions: [] } });
  sendSuccess(res, 'Logged out of all sessions');
});

// @desc    Log out of the current device
// @route   POST /api/v1/auth/logout
// @access  Private
// NOTE: access tokens are stateless and `tokenVersion` is per-account, so
// bumping it here would sign the account out on every device. This endpoint
// therefore unregisters the calling device's push token and acknowledges the
// sign-out; the client discards its stored tokens. Use /auth/logout-all to
// actually revoke every outstanding token for the account.
export const logout = asyncHandler(async (req, res) => {
  const fcmToken = typeof req.body?.fcmToken === 'string' ? req.body.fcmToken : null;

  // Revoke this device's refresh token when the client supplies it.
  if (typeof req.body?.refreshToken === 'string') {
    try {
      const d = verifyRefreshToken(req.body.refreshToken);
      if (d.jti && String(d.id) === String(req.user.id)) {
        await User.updateOne({ _id: req.user.id }, { $pull: { refreshSessions: { jti: d.jti } } });
      }
    } catch {
      // An invalid token has nothing to revoke.
    }
  }

  if (fcmToken) {
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { fcmTokens: fcmToken, fcmTokenApp: fcmToken } }
    );
  }

  sendSuccess(res, 'Logged out successfully');
});
