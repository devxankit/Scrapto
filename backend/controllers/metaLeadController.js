import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import MetaLead from '../models/MetaLead.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import { ORDER_STATUS, ORDER_TYPES, PAYMENT_STATUS, SCRAP_CATEGORIES } from '../config/constants.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';
import { notifyUser } from '../services/socketService.js';
import logger from '../utils/logger.js';
import { parseMetaLeadsFile, generateSampleMetaLeadsWorkbook } from '../utils/metaLeadParser.js';
import { parsePagination, safeSearchRegex, assertObjectId } from '../utils/security.js';

/**
 * Helper: Match or map scrap category string to SCRAP_CATEGORIES enum
 */
const resolveScrapCategory = (text) => {
  const t = String(text || '').toLowerCase();
  if (t.includes('paper') || t.includes('book') || t.includes('carton') || t.includes('newspaper')) return 'paper';
  if (t.includes('plastic') || t.includes('bottle')) return 'plastic';
  if (t.includes('iron') || t.includes('metal') || t.includes('steel')) return 'iron';
  if (t.includes('copper')) return 'copper';
  if (t.includes('brass')) return 'brass';
  if (t.includes('aluminium') || t.includes('aluminum')) return 'aluminium';
  if (t.includes('ac') || t.includes('fridge') || t.includes('electronic') || t.includes('appliance')) return 'appliances';
  if (t.includes('vehicle') || t.includes('car') || t.includes('bike')) return 'vehicles';
  return 'mixed';
};

/**
 * Helper: Find or create a Customer User account for a Meta Lead
 */
const getOrCreateCustomerUser = async (lead) => {
  let user = await User.findOne({ phone: lead.phone });
  if (!user) {
    const safeEmail = lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)
      ? lead.email.toLowerCase()
      : `customer.${lead.phone}@scrapto.in`;

    user = await User.findOne({ email: safeEmail });
    if (!user) {
      user = await User.create({
        name: lead.name || 'Meta Customer',
        phone: lead.phone,
        email: safeEmail,
        role: 'user',
        addresses: [{
          street: lead.address,
          city: lead.city || 'Delhi',
          state: lead.state || 'Delhi',
          pincode: lead.pincode || '110001',
          isDefault: true,
          coordinates: { lat: 28.6139, lng: 77.2090 }
        }]
      });
    }
  }
  return user;
};

/**
 * Helper: Convert a Lead to an active assigned Order in MongoDB and notify the scrapper
 */
const assignLeadToScrapper = async (lead, scrapper, distributionMode, uploadedBy) => {
  const customerUser = await getOrCreateCustomerUser(lead);
  const now = new Date();
  const orderNo = 'ML-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const category = resolveScrapCategory(lead.scrapType);
  const weight = lead.estimatedWeight || 10;
  const rate = 15; // Standard base rate per kg
  const estimatedTotal = weight * rate;

  const order = await Order.create({
    user: customerUser._id,
    scrapper: scrapper._id,
    orderNo,
    orderType: ORDER_TYPES.SCRAP_SELL,
    status: ORDER_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.PENDING,
    assignmentStatus: 'assigned',
    assignedAt: now,
    pickupAddress: {
      street: lead.address,
      city: lead.city || 'Delhi',
      state: lead.state || 'Delhi',
      pincode: lead.pincode || '110001',
      coordinates: { lat: 28.6139, lng: 77.2090 },
      location: {
        type: 'Point',
        coordinates: [77.2090, 28.6139]
      }
    },
    location: {
      type: 'Point',
      coordinates: [77.2090, 28.6139]
    },
    pickupSlot: {
      dayName: 'Today',
      date: now.toLocaleDateString('en-IN'),
      slot: lead.preferredDate || 'Direct Lead',
      timestamp: Date.now()
    },
    scrapItems: [{
      category,
      weight,
      rate,
      total: estimatedTotal
    }],
    totalWeight: weight,
    totalAmount: estimatedTotal,
    notes: lead.notes || (lead.campaignName ? `Meta Ad: ${lead.campaignName}` : 'Meta Lead pickup'),
    assignmentHistory: [{
      scrapper: scrapper._id,
      assignedAt: now,
      status: 'assigned'
    }]
  });

  // Update lead
  lead.status = 'assigned';
  lead.distributionType = distributionMode;
  lead.assignedScrapper = scrapper._id;
  lead.assignedOrder = order._id;
  lead.assignedAt = now;
  if (uploadedBy && !lead.uploadedBy) lead.uploadedBy = uploadedBy;
  await lead.save();

  // Instant notification to Scrapper App
  const scrapperIdStr = scrapper._id.toString();
  try {
    await sendNotificationToUser(scrapperIdStr, {
      title: 'New Meta Lead Assigned 📋',
      body: `Customer: ${lead.name} (${lead.city || 'Near you'}). Est. ${weight} kg scrap. Tap to view job!`,
      data: {
        orderId: order._id.toString(),
        type: 'order_assigned',
        source: 'meta_lead'
      }
    });

    notifyUser(scrapperIdStr, 'order_assigned', {
      orderId: order._id.toString(),
      order: order.toObject()
    });
  } catch (err) {
    logger.warn(`[MetaLead] Could not send push notification to scrapper ${scrapperIdStr}: ${err.message}`);
  }

  return { order, lead };
};

/**
 * @desc    Upload Meta Leads Excel / CSV file (Preview, Manual, or Automatic)
 * @route   POST /api/v1/admin/leads/upload
 * @access  Private (Admin)
 */
export const uploadMetaLeads = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return sendError(res, 'Please upload an Excel (.xlsx, .xls) or CSV file', 400);
  }

  const distributionMode = req.body.distributionMode || 'preview'; // 'preview' | 'manual' | 'automatic'
  const targetScrapperId = req.body.targetScrapperId;

  let parseResult;
  try {
    parseResult = parseMetaLeadsFile(req.file.buffer);
  } catch (err) {
    return sendError(res, `File parsing failed: ${err.message}`, 400);
  }

  const { totalRows, validCount, invalidCount, validLeads, invalidRows } = parseResult;

  // Mode 1: PREVIEW ONLY
  if (distributionMode === 'preview') {
    return sendSuccess(res, 'File parsed successfully', {
      totalRows,
      validCount,
      invalidCount,
      preview: validLeads.slice(0, 50),
      invalidRows: invalidRows.slice(0, 20)
    });
  }

  if (validCount === 0) {
    return sendError(res, 'No valid leads found in the uploaded file', 400);
  }

  const batchId = 'BATCH-' + Date.now().toString(36).toUpperCase();
  const savedLeads = [];

  // Mode 2: MANUAL DISTRIBUTION (Save as unassigned leads for later assignment)
  if (distributionMode === 'manual' && !targetScrapperId) {
    for (const leadData of validLeads) {
      const doc = await MetaLead.create({
        ...leadData,
        uploadBatch: batchId,
        status: 'unassigned',
        distributionType: 'manual',
        uploadedBy: req.user._id
      });
      savedLeads.push(doc);
    }

    return sendSuccess(res, `Successfully saved ${savedLeads.length} leads for manual assignment`, {
      batchId,
      totalRows,
      validCount: savedLeads.length,
      invalidCount,
      distributionMode: 'manual',
      invalidRows: invalidRows.slice(0, 20)
    }, 201);
  }

  // Mode 3: AUTOMATIC DISTRIBUTION (or assign all to targetScrapperId)
  let eligibleScrappers = [];

  if (targetScrapperId) {
    const scrapper = await Scrapper.findById(targetScrapperId);
    if (!scrapper) return sendError(res, 'Target scrapper not found', 404);
    if (scrapper.status !== 'active') return sendError(res, 'Target scrapper is not active', 400);
    eligibleScrappers = [scrapper];
  } else {
    // Dynamic query: all active scrappers with verified KYC, fallback to any active scrapper
    eligibleScrappers = await Scrapper.find({ status: 'active', 'kyc.status': 'verified' });
    if (eligibleScrappers.length === 0) {
      eligibleScrappers = await Scrapper.find({ status: 'active' });
    }
  }

  // If no scrappers currently registered/active, save as unassigned leads so they aren't lost
  if (eligibleScrappers.length === 0) {
    for (const leadData of validLeads) {
      const doc = await MetaLead.create({
        ...leadData,
        uploadBatch: batchId,
        status: 'unassigned',
        distributionType: 'manual',
        uploadedBy: req.user._id
      });
      savedLeads.push(doc);
    }

    return sendSuccess(res, `No active scrappers online. Saved ${savedLeads.length} leads as unassigned.`, {
      batchId,
      totalRows,
      validCount: savedLeads.length,
      invalidCount,
      distributionMode: 'saved_unassigned',
      invalidRows: invalidRows.slice(0, 20)
    }, 201);
  }

  // Distribute across eligible scrappers (round-robin)
  const scrapperAssignmentCounts = {};
  eligibleScrappers.forEach(s => { scrapperAssignmentCounts[s._id.toString()] = 0; });

  let scrapperIndex = 0;
  for (const leadData of validLeads) {
    const assignedScrapper = eligibleScrappers[scrapperIndex % eligibleScrappers.length];
    scrapperIndex++;

    const leadDoc = new MetaLead({
      ...leadData,
      uploadBatch: batchId,
      status: 'unassigned',
      uploadedBy: req.user._id
    });

    await assignLeadToScrapper(leadDoc, assignedScrapper, targetScrapperId ? 'manual' : 'automatic', req.user._id);
    scrapperAssignmentCounts[assignedScrapper._id.toString()] += 1;
    savedLeads.push(leadDoc);
  }

  logger.info(`[MetaLead] Batch ${batchId}: Distributed ${savedLeads.length} leads across ${eligibleScrappers.length} scrappers.`);

  sendSuccess(res, `Distributed ${savedLeads.length} leads instantly to ${eligibleScrappers.length} scrappers!`, {
    batchId,
    totalRows,
    assignedCount: savedLeads.length,
    invalidCount,
    distributionMode: targetScrapperId ? 'manual' : 'automatic',
    scrappers: eligibleScrappers.map(s => ({
      id: s._id,
      name: s.name,
      phone: s.phone,
      leadsAssigned: scrapperAssignmentCounts[s._id.toString()] || 0
    })),
    invalidRows: invalidRows.slice(0, 20)
  }, 201);
});

/**
 * @desc    Distribute specific or bulk unassigned Meta Leads
 * @route   POST /api/v1/admin/leads/distribute
 * @access  Private (Admin)
 */
export const distributeMetaLeads = asyncHandler(async (req, res) => {
  const { leadIds, distributionMode, scrapperId } = req.body;

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return sendError(res, 'Please provide an array of lead IDs to distribute', 400);
  }

  // Fetch unassigned leads
  const leads = await MetaLead.find({
    _id: { $in: leadIds },
    status: 'unassigned'
  });

  if (leads.length === 0) {
    return sendError(res, 'No unassigned leads found for the provided IDs', 404);
  }

  let targetScrappers = [];
  if (distributionMode === 'manual') {
    if (!scrapperId) return sendError(res, 'scrapperId is required for manual distribution', 400);
    const sId = assertObjectId(scrapperId, 'scrapperId');
    const scrapper = await Scrapper.findById(sId);
    if (!scrapper) return sendError(res, 'Target scrapper not found', 404);
    if (scrapper.status !== 'active') return sendError(res, 'Target scrapper is not active', 400);
    targetScrappers = [scrapper];
  } else {
    // Automatic round-robin
    targetScrappers = await Scrapper.find({ status: 'active', 'kyc.status': 'verified' });
    if (targetScrappers.length === 0) {
      targetScrappers = await Scrapper.find({ status: 'active' });
    }
    if (targetScrappers.length === 0) {
      return sendError(res, 'No active scrappers available in the system', 400);
    }
  }

  let scrapperIndex = 0;
  const assignedResults = [];

  for (const lead of leads) {
    const scrapper = targetScrappers[scrapperIndex % targetScrappers.length];
    scrapperIndex++;

    const result = await assignLeadToScrapper(lead, scrapper, distributionMode, req.user._id);
    assignedResults.push({
      leadId: lead._id,
      orderId: result.order._id,
      orderNo: result.order.orderNo,
      scrapperId: scrapper._id,
      scrapperName: scrapper.name
    });
  }

  sendSuccess(res, `Successfully distributed ${assignedResults.length} leads to scrapper apps`, {
    assignedCount: assignedResults.length,
    results: assignedResults
  });
});

/**
 * @desc    Get all Meta Leads with filters & summary statistics
 * @route   GET /api/v1/admin/leads
 * @access  Private (Admin)
 */
export const getMetaLeads = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (req.query.status && req.query.status !== 'all') {
    filter.status = req.query.status;
  }
  if (req.query.batchId) {
    filter.uploadBatch = req.query.batchId;
  }
  if (req.query.scrapperId) {
    filter.assignedScrapper = req.query.scrapperId;
  }

  const search = safeSearchRegex(req.query.search);
  if (search) {
    filter.$or = [
      { name: search },
      { phone: search },
      { address: search },
      { city: search },
      { campaignName: search }
    ];
  }

  const [leads, total, totalAll, unassignedCount, assignedCount, completedCount] = await Promise.all([
    MetaLead.find(filter)
      .populate('assignedScrapper', 'name phone vehicleType status isOnline')
      .populate('assignedOrder', 'orderNo status totalAmount createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    MetaLead.countDocuments(filter),
    MetaLead.countDocuments({}),
    MetaLead.countDocuments({ status: 'unassigned' }),
    MetaLead.countDocuments({ status: 'assigned' }),
    MetaLead.countDocuments({ status: 'completed' })
  ]);

  sendSuccess(res, 'Meta Leads retrieved successfully', {
    leads,
    stats: {
      total: totalAll,
      unassigned: unassignedCount,
      assigned: assignedCount,
      completed: completedCount
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

/**
 * @desc    Get Active Scrappers Summary for dynamic dropdowns
 * @route   GET /api/v1/admin/leads/active-scrappers
 * @access  Private (Admin)
 */
export const getActiveScrappersForDistribution = asyncHandler(async (req, res) => {
  const scrappers = await Scrapper.find({ status: 'active' })
    .select('name phone vehicleType isOnline kyc.status coverageAreas')
    .sort({ isOnline: -1, name: 1 })
    .lean();

  sendSuccess(res, 'Active scrappers list retrieved', {
    scrappers: scrappers.map(s => ({
      id: s._id,
      name: s.name,
      phone: s.phone,
      vehicleType: s.vehicleType || 'Truck',
      isOnline: !!s.isOnline,
      kycVerified: s.kyc?.status === 'verified',
      coverageAreas: s.coverageAreas || []
    }))
  });
});

/**
 * @desc    Delete Meta Lead
 * @route   DELETE /api/v1/admin/leads/:id
 * @access  Private (Admin)
 */
export const deleteMetaLead = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'lead id');
  const lead = await MetaLead.findById(id);
  if (!lead) return sendError(res, 'Lead not found', 404);

  // If lead had an assigned order that is still pending/confirmed, cancel the order
  if (lead.assignedOrder) {
    await Order.findByIdAndUpdate(lead.assignedOrder, {
      $set: { status: ORDER_STATUS.CANCELLED, cancellationReason: 'Lead deleted by admin' }
    });
  }

  await lead.deleteOne();
  sendSuccess(res, 'Lead deleted successfully', {});
});

/**
 * @desc    Download Sample Meta Leads Excel Template
 * @route   GET /api/v1/admin/leads/template
 * @access  Public / Admin
 */
export const downloadMetaLeadsTemplate = (req, res) => {
  try {
    const buffer = generateSampleMetaLeadsWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Scrapto_Meta_Leads_Template.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    logger.error('[MetaLead] Template generation error:', error);
    sendError(res, 'Failed to generate template', 500);
  }
};
