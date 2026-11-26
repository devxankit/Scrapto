import mongoose from 'mongoose';
import { ORDER_STATUS, PAYMENT_STATUS, SCRAP_CATEGORIES, ORDER_TYPES } from '../config/constants.js';

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scrapper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scrapper',
    default: null
  },
  orderType: {
    type: String,
    enum: Object.values(ORDER_TYPES),
    default: ORDER_TYPES.SCRAP_SELL
  },
  serviceDetails: {
    serviceType: String,
    description: String
  },
  serviceFee: {
    type: Number,
    default: 0,
    min: 0
  },
  review: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    default: null
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  orderNo: {
    type: String,
    trim: true,
    index: true
  },
  weighedAt: {
    type: Date,
    default: null
  },
  paidAmount: {
    type: Number,
    default: null
  },
  skippedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  scrapItems: [{
    category: {
      type: String,
      trim: true,
      lowercase: true,
      enum: Object.values(SCRAP_CATEGORIES),
      required: true
    },
    weight: {
      type: Number,
      required: true,
      min: 0
    },
    rate: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  totalWeight: {
    type: Number,
    required: true,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING
  },
  pickupAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    }
  },
  // Top-level GeoJSON point used for $nearSphere radius queries.
  // (Previously controllers wrote `location` but the schema lacked the path, so
  // strict mode silently dropped it and geo filtering matched nothing.)
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number] // [longitude, latitude]
    }
  },
  preferredTime: {
    type: String,
    default: null
  },
  pickupSlot: {
    dayName: String,
    date: String,
    slot: String,
    timestamp: Number
  },
  scheduledDate: {
    type: Date,
    default: null
  },
  completedDate: {
    type: Date,
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  assignmentStatus: {
    type: String,
    enum: ['unassigned', 'assigned', 'accepted', 'rejected'],
    default: 'unassigned'
  },
  assignmentHistory: [{
    scrapper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: Date,
    status: String,
    timeoutAt: Date
  }],
  images: [{
    url: String,
    publicId: String
  }],
  notes: {
    type: String,
    default: ''
  },
  // Set when the order was created from an admin-uploaded lead: the lead's own
  // details, shown to the partner as uploaded (the customer account may hold
  // another name or no email).
  leadInfo: {
    type: new mongoose.Schema({
      name: String,
      phone: String,
      email: String,
      address: String,
      category: String,
      preferredAt: Date,
      preferredText: String,
      price: Number,
      source: String
    }, { _id: false }),
    default: undefined
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'scrapper', 'admin', null],
    default: null
  },
  cancellationReason: {
    type: String,
    default: null
  },
  // How the final payment settled ('wallet' | 'razorpay' | 'cash')
  paidVia: {
    type: String,
    enum: ['wallet', 'razorpay', 'cash', null],
    default: null
  },
  // Set once the completion-time wallet/commission settlement has run.
  // Guarantees settlement is applied at most once per order.
  settlementDone: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      if (!ret.orderNo && ret._id) {
        ret.orderNo = ret._id.toString().slice(-6).toUpperCase();
      }
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      if (!ret.orderNo && ret._id) {
        ret.orderNo = ret._id.toString().slice(-6).toUpperCase();
      }
      return ret;
    }
  }
});

orderSchema.pre('save', function (next) {
  if (!this.orderNo && this._id) {
    this.orderNo = this._id.toString().slice(-6).toUpperCase();
  }
  next();
});

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ scrapper: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ location: '2dsphere' }, { sparse: true });
orderSchema.index({ orderType: 1 });
orderSchema.index({ status: 1, assignmentStatus: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

export default Order;

