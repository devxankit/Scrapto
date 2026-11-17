import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { USER_ROLES } from '../config/constants.js';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [254, 'Email is too long'],
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true
  },
  // Only admin accounts authenticate with a password. Users and scrappers are
  // OTP-only and have no password at all (so there is nothing to brute-force).
  password: {
    type: String,
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Incremented to revoke every outstanding access/refresh token for this account
  // (block, role change, password change, logout-all, refresh-token reuse).
  tokenVersion: {
    type: Number,
    default: 0
  },
  // Live refresh-token ids, one per signed-in device (most recent 10). A
  // refresh consumes its id; presenting a consumed id is treated as token
  // theft and revokes every session (tokenVersion++).
  refreshSessions: {
    type: [{ _id: false, jti: String, expiresAt: Date }],
    default: [],
    select: false
  },
  profileImage: {
    type: String,
    default: null
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  // Saved address book (pickup locations). The legacy single `address` above is
  // kept for backward compatibility with existing documents and admin views.
  addresses: [
    {
      type: { type: String, enum: ['home', 'office', 'other'], default: 'home' },
      label: { type: String, trim: true, maxlength: 60 },
      street: { type: String, trim: true, maxlength: 250 },
      landmark: { type: String, trim: true, maxlength: 120 },
      city: { type: String, trim: true, maxlength: 80 },
      state: { type: String, trim: true, maxlength: 80 },
      pincode: { type: String, trim: true },
      coordinates: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 }
      },
      isDefault: { type: Boolean, default: false }
    }
  ],
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpire: { type: Date, select: false },
  verificationToken: { type: String, select: false },
  verificationExpire: { type: Date, select: false },

  // --- OTP state (never returned by default) ---
  // HMAC-SHA256 of the OTP (keyed, bound to phone). The plaintext OTP is never stored.
  phoneVerificationOTP: { type: String, select: false },
  otpExpiresAt: { type: Date, select: false },
  otpAttempts: { type: Number, default: 0, select: false },
  otpLastSentAt: { type: Date, select: false },
  otpSendWindowStart: { type: Date, select: false },
  otpSendCount: { type: Number, default: 0, select: false },

  // --- Password login lockout (admin accounts) ---
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, default: null, select: false },

  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  wallet: {
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Insufficient funds']
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'FROZEN'],
      default: 'ACTIVE'
    }
  },
  bankDetails: {
    accountNumber: String, // last 4 digits only
    ifsc: String,
    beneficiaryName: String,
    bankName: String,
    fundAccountId: String, // Razorpay Fund Account ID
    contactId: String // Razorpay Contact ID
  },
  // Referral System
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // FCM Tokens
  fcmTokens: {
    type: [String],
    default: []
  },
  fcmTokenApp: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ referredBy: 1 }, { sparse: true });

// Hash password before saving â€” ONLY when it actually changed.
// (Previously a missing `return` re-hashed the existing hash on every save,
// silently corrupting credentials.)
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) {
    // A password change invalidates every existing session.
    this.tokenVersion = (this.tokenVersion || 0) + 1;
  }
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || typeof enteredPassword !== 'string') return false;
  return bcrypt.compare(enteredPassword, this.password);
};

const SENSITIVE_FIELDS = [
  'password',
  'phoneVerificationOTP',
  'otpExpiresAt',
  'otpAttempts',
  'otpLastSentAt',
  'otpSendWindowStart',
  'otpSendCount',
  'failedLoginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpire',
  'verificationToken',
  'verificationExpire',
  'tokenVersion',
  'fcmTokens',
  'fcmTokenApp',
  '__v'
];

const stripSensitive = (doc, ret) => {
  for (const field of SENSITIVE_FIELDS) {
    delete ret[field];
  }
  if (ret.bankDetails) {
    delete ret.bankDetails.fundAccountId;
    delete ret.bankDetails.contactId;
  }
  return ret;
};

// Strip secrets from BOTH toJSON and toObject so no code path can leak them.
userSchema.set('toJSON', { transform: stripSensitive });
userSchema.set('toObject', { transform: stripSensitive });

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Pre-save hook to generate referral code
userSchema.pre('save', async function () {
  if (this.referralCode) return;
  // A document loaded with a projection that omits referralCode only LOOKS
  // empty. Generating here would overwrite the user's real, already-shared
  // code (seen when saving an address with select('addresses')).
  if (!this.isNew && !this.isSelected('referralCode')) return;
  const prefix = this.role === 'scrapper' ? 'SCRAP' : 'USER';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let randomStr = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i += 1) {
      randomStr += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
    }
    const code = `${prefix}-${randomStr}`;
    const existing = await mongoose.models.User.exists({ referralCode: code });
    if (!existing) {
      this.referralCode = code;
      return;
    }
  }
  throw new Error('Could not generate a unique referral code');
});

const User = mongoose.model('User', userSchema);

export default User;
