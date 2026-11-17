import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import ScrapperLead from '../models/ScrapperLead.js';
import logger from '../utils/logger.js';
import { parsePagination, safeSearchRegex, assertObjectId } from '../utils/security.js';

// @desc    Get all leads
// @route   GET /api/admin/leads
// @access  Private (Admin)
export const getAllLeads = asyncHandler(async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const searchRegex = safeSearchRegex(req.query.search);
        if (searchRegex) {
            filter.$or = [
                { name: searchRegex },
                { phone: searchRegex },
                { area: searchRegex }
            ];
        }

        const [leads, total] = await Promise.all([
            ScrapperLead.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ScrapperLead.countDocuments(filter)
        ]);

        sendSuccess(res, 'Leads retrieved successfully', {
            leads,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('[Admin] Error fetching leads:', error);
        sendError(res, 'Failed to fetch leads', 500);
    }
});

// @desc    Create new lead
// @route   POST /api/admin/leads
// @access  Private (Admin)
export const createLead = asyncHandler(async (req, res) => {
    try {
        const { name, phone, area, vehicleInfo, notes, source } = req.body;

        const existingLead = await ScrapperLead.findOne({ phone });
        if (existingLead) {
            return sendError(res, 'Lead with this phone number already exists', 400);
        }

        const lead = await ScrapperLead.create({
            name,
            phone,
            area,
            vehicleInfo,
            notes,
            source: source || 'admin_manual',
            status: 'new'
        });

        sendSuccess(res, 'Lead created successfully', { lead }, 201);
    } catch (error) {
        logger.error('[Admin] Error creating lead:', error);
        sendError(res, 'Failed to create lead', 500);
    }
});

// @desc    Update lead
// @route   PUT /api/admin/leads/:id
// @access  Private (Admin)
export const updateLead = asyncHandler(async (req, res) => {
    try {
        const id = assertObjectId(req.params.id, 'lead id');
        const { name, phone, area, vehicleInfo, notes, status } = req.body;

        let lead = await ScrapperLead.findById(id);
        if (!lead) {
            return sendError(res, 'Lead not found', 404);
        }

        if (name) lead.name = name;
        if (phone) lead.phone = phone;
        if (area) lead.area = area;
        if (vehicleInfo) lead.vehicleInfo = vehicleInfo;
        if (notes) lead.notes = notes;
        if (status) lead.status = status;

        await lead.save();

        sendSuccess(res, 'Lead updated successfully', { lead });
    } catch (error) {
        logger.error('[Admin] Error updating lead:', error);
        if (error.code === 11000) {
            return sendError(res, 'Phone number already exists', 400);
        }
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        sendError(res, 'Failed to update lead', 500);
    }
});

// @desc    Delete lead
// @route   DELETE /api/admin/leads/:id
// @access  Private (Admin)
export const deleteLead = asyncHandler(async (req, res) => {
    try {
        const id = assertObjectId(req.params.id, 'lead id');
        const lead = await ScrapperLead.findById(id);
        if (!lead) {
            return sendError(res, 'Lead not found', 404);
        }

        await lead.deleteOne();
        sendSuccess(res, 'Lead deleted successfully', {});
    } catch (error) {
        logger.error('[Admin] Error deleting lead:', error);
        sendError(res, 'Failed to delete lead', 500);
    }
});
