import mongoose from 'mongoose';

const metaLeadSchema = new mongoose.Schema({
  leadId: {
    type: String,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Customer phone is required'],
    trim: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  city: {
    type: String,
    trim: true,
    default: 'Delhi'
  },
  state: {
    type: String,
    trim: true,
    default: 'Delhi'
  },
  pincode: {
    type: String,
    trim: true,
    default: ''
  },
  scrapType: {
    type: String,
    trim: true,
    default: 'Mixed Scrap'
  },
  estimatedWeight: {
    type: Number,
    default: 10,
    min: 0
  },
  preferredDate: {
    type: String,
    trim: true,
    default: 'ASAP'
  },
  // "Date and time" column read as a real date (null when it was text like "ASAP").
  preferredAt: {
    type: Date,
    default: null
  },
  // "Price" column: the price agreed with the customer for this lead (₹).
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  // Expected fields that were empty in the sheet (Mail ID, Category, Date and time, Price).
  missing: {
    type: [String],
    default: []
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  campaignName: {
    type: String,
    trim: true,
    default: ''
  },
  adName: {
    type: String,
    trim: true,
    default: ''
  },
  formName: {
    type: String,
    trim: true,
    default: ''
  },
  rawDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  uploadBatch: {
    type: String,
    trim: true,
    index: true
  },
  source: {
    type: String,
    enum: ['meta_ad', 'manual_excel', 'website', 'other'],
    default: 'meta_ad'
  },
  status: {
    type: String,
    enum: ['unassigned', 'assigned', 'completed', 'cancelled'],
    default: 'unassigned',
    index: true
  },
  distributionType: {
    type: String,
    enum: ['manual', 'automatic', 'pending'],
    default: 'pending'
  },
  assignedScrapper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scrapper',
    default: null
  },
  assignedOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for searching & filtering
metaLeadSchema.index({ status: 1, createdAt: -1 });
metaLeadSchema.index({ assignedScrapper: 1, status: 1 });

const MetaLead = mongoose.model('MetaLead', metaLeadSchema);

export default MetaLead;
