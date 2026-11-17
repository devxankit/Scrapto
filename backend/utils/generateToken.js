import jwt from 'jsonwebtoken';
import { getJwtSecret, getJwtRefreshSecret } from '../config/env.js';

/**
 * Access token: short-lived, carries id + role + tokenVersion.
 * The role in the token is ALWAYS the server-side role; it is informational —
 * every privileged route re-checks the database role via the auth middleware.
 */
export const generateToken = (userId, role, tokenVersion = 0) => {
  return jwt.sign(
    { id: String(userId), role, tv: tokenVersion, typ: 'access' },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRE || '1d' }
  );
};

/**
 * Refresh token: longer-lived, signed with a DIFFERENT secret, and marked with
 * typ so it can never be accepted where an access token is expected.
 */
export const generateRefreshToken = (userId, tokenVersion = 0) => {
  return jwt.sign(
    { id: String(userId), tv: tokenVersion, typ: 'refresh' },
    getJwtRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

export const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.typ && decoded.typ !== 'access') {
    const err = new jwt.JsonWebTokenError('Wrong token type');
    throw err;
  }
  return decoded;
};

export const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, getJwtRefreshSecret());
  if (decoded.typ !== 'refresh') {
    throw new jwt.JsonWebTokenError('Wrong token type');
  }
  return decoded;
};
