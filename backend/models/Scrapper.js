import mongoose from 'mongoose';

const kycDocumentSchema = new mongoose.Schema({
  // Cloudinary public id of a PRIVATE (type=authenticated) asset. Never a public URL.
  publicId: { type: String, default: null },
  resourceType: { type: String, default: 'image' },
  format: { type: String, default: null },
  bytes: { type: Number, default: null },
  uploadedAt: { type: Date, default: null }
}, { _id: false });

const scrapperSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    maxlength: [254, 'Email is too long'],
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email']
  },
  // Optional at creation; mandatory before a scrapper can go online.
  city: {
    type: String,
    trim: true,
    maxlength: [80, 'City is too long'],
    default: null
  },
  profilePic: {
    type: String,
    default: null
  },
  services: {
    type: [String],
    enum: ['scrap_pickup', 'home_cleaning'],
    default: ['scrap_pickup']
  },
  vehicleInfo: {
    type: {
      type: String,
      enum: ['bike', 'auto', 'truck'],
      required: true
    },
    number: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    capacity: {
      type: Number,
      required: true,
      min: 0
    }
  },
  kyc: {
    // AES-256-GCM encrypted at the application layer (utils/fieldEncryption.js).
    aadhaarNumber: {
      type: String,
      select: false
    },
    // Last 4 digits only, for display ("XXXX-XXXX-1234").
    aadhaarLast4: {
      type: String,
      default: null
    },
    // Private document references. Resolved to short-lived signed URLs on demand
    // for the owner and for admins only.
    documents: {
      type: {
        aadhaar: { type: kycDocumentSchema, default: undefined },
        selfie: { type: kycDocumentSchema, default: undefined },
        license: { type: kycDocumentSchema, default: undefined }
      },
      select: false,
      default: undefined
    },
    // LEGACY public URLs (pre-remediation uploads). Hidden by default; only read by
    // the privacy migration script and by admin views until migration completes.
    aadhaarPhotoUrl: { type: String, default: null, select: false },
    selfieUrl: { type: String, default: null, select: false },
    licenseUrl: { type: String, default: null, select: false },
    // New scrappers are NOT verified until an admin reviews their documents.
    status: {
      type: String,
      enum: ['not_submitted', 'pending', 'verified', 'rejected'],
      default: 'not_submitted'
    },
    submittedAt: {
      type: Date,
      default: null
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    }
  },
  subscription: {
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'none'],
      default: 'none'
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      default: null
    },
    startDate: {
      type: Date,
      default: null
    },
    expiryDate: {
      type: Date,
      default: null
    },
    razorpaySubscriptionId: {
      type: String,
      default: null
    },
    razorpayPaymentId: {
      type: String,
      default: null
    },
    autoRenew: {
      type: Boolean,
      default: true
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    cancellationReason: {
      type: String,
      default: null
    },
    usedPickups: {
      type: Number,
      default: 0
    }
  },
  liveLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    updatedAt: {
      type: Date,
      default: null
    }
  },
  availableSlots: [{
    day: {
      type: Number, // 0-6 (Sunday-Saturday)
      required: true,
      min: 0,
      max: 6
    },
    timeSlots: [{
      start: {
        type: String,
        required: true
      },
      end: {
        type: String,
        required: true
      }
    }]
  }],
  isOnline: {
    type: Boolean,
    default: false
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    breakdown: {
      5: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 }
    },
    lastUpdated: {
      type: Date,
      default: null
    }
  },
  totalPickups: {
    type: Number,
    default: 0
  },
  earnings: {
    total: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    },
    withdrawn: {
      type: Number,
      default: 0
    }
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
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Referral',
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'blocked', 'suspended'],
    default: 'active'
  },
  statusReason: {
    type: String,
    default: null
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
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

// Geospatial index for location queries
scrapperSchema.index({ liveLocation: '2dsphere' });
scrapperSchema.index({ isOnline: 1, status: 1, 'kyc.status': 1 });
scrapperSchema.index({ 'kyc.status': 1, createdAt: -1 });
scrapperSchema.index({ 'subscription.status': 1, 'subscription.expiryDate': 1 });
scrapperSchema.index({ status: 1, createdAt: -1 });

/**
 * Subscription entitlement: an active (or cancelled-but-not-yet-expired)
 * subscription whose expiry date is in the future.
 */
scrapperSchema.methods.hasActiveSubscription = function (now = new Date()) {
  const sub = this.subscription;
  if (!sub || !sub.expiryDate) return false;
  if (sub.status !== 'active' && sub.status !== 'cancelled') return false;
  return new Date(sub.expiryDate) > now;
};

scrapperSchema.methods.isInGoodStanding = function () {
  return this.status === 'active';
};

scrapperSchema.methods.isKycVerified = function () {
  return this.kyc?.status === 'verified';
};

const stripSensitive = (doc, ret) => {
  delete ret.password;
  delete ret.phoneVerificationOTP;
  delete ret.otpExpiresAt;
  delete ret.fcmTokens;
  delete ret.fcmTokenApp;
  delete ret.__v;
  if (ret.kyc) {
    delete ret.kyc.aadhaarNumber;
    delete ret.kyc.documents;
  }
  return ret;
};

scrapperSchema.set('toJSON', { transform: stripSensitive });
scrapperSchema.set('toObject', { transform: stripSensitive });

const Scrapper = mongoose.model('Scrapper', scrapperSchema);

export default Scrapper;
