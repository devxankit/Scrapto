import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import HelpTicket from '../models/HelpTicket.js';
import logger from '../utils/logger.js';
import { parsePagination, safeSearchRegex, assertObjectId, pickEnum, asString } from '../utils/security.js';

// @desc    Create a new support ticket
// @route   POST /api/support
// @access  Public/Private
export const createTicket = asyncHandler(async (req, res) => {
    try {
        const { subject, message, type, priority, name, email, role } = req.body;

        const cleanSubject = asString(subject, 200);
        const cleanMessage = asString(message, 5000);
        if (!cleanSubject || !cleanMessage) {
            return sendError(res, 'Subject and message are required', 400);
        }

        const validTypes = ['issue', 'feedback', 'general', 'payment', 'account'];
        const validPriorities = ['low', 'medium', 'high', 'urgent'];

        const ticketData = {
            subject: cleanSubject,
            message: cleanMessage,
            type: pickEnum(type, validTypes) || 'general',
            priority: pickEnum(priority, validPriorities) || 'medium',
            role: 'guest',
            name: asString(name, 100),
            email: asString(email, 150)
        };

        // If authenticated, attach user/scrapper ID
        if (req.user) {
            if (req.user.role === 'scrapper') {
                ticketData.scrapper = req.user.id;
                ticketData.role = 'scrapper';
                ticketData.name = req.user.name || ticketData.name;
                ticketData.email = req.user.email || ticketData.email;
            } else {
                ticketData.user = req.user.id;
                ticketData.role = 'user';
                ticketData.name = req.user.name || ticketData.name;
                ticketData.email = req.user.email || ticketData.email;
            }
        }

        const ticket = await HelpTicket.create(ticketData);

        sendSuccess(res, 'Support ticket created successfully', { ticket }, 201);
    } catch (error) {
        logger.error('[Support] Error creating ticket:', error);
        sendError(res, 'Failed to create support ticket', 500);
    }
});

// @desc    Get all tickets (Admin)
// @route   GET /api/support/admin/all
// @access  Private (Admin)
export const getAllTickets = asyncHandler(async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const filter = {};
        const status = pickEnum(req.query.status, ['open', 'in_progress', 'resolved', 'closed']);
        if (status) filter.status = status;

        const priority = pickEnum(req.query.priority, ['low', 'medium', 'high', 'urgent']);
        if (priority) filter.priority = priority;

        const type = pickEnum(req.query.type, ['issue', 'feedback', 'general', 'payment', 'account']);
        if (type) filter.type = type;

        const searchRegex = safeSearchRegex(req.query.search);
        if (searchRegex) {
            filter.$or = [
                { subject: searchRegex },
                { message: searchRegex },
                { name: searchRegex },
                { email: searchRegex }
            ];
        }

        const [tickets, total] = await Promise.all([
            HelpTicket.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            HelpTicket.countDocuments(filter)
        ]);

        sendSuccess(res, 'Tickets retrieved successfully', {
            tickets,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('[Support] Error fetching tickets:', error);
        sendError(res, 'Failed to fetch tickets', 500);
    }
});

// @desc    Get my tickets
// @route   GET /api/support/my-tickets
// @access  Private
export const getMyTickets = asyncHandler(async (req, res) => {
    try {
        const filter = {};
        if (req.user.role === 'scrapper') {
            filter.scrapper = req.user.id;
        } else {
            filter.user = req.user.id;
        }

        const tickets = await HelpTicket.find(filter).sort({ createdAt: -1 });

        sendSuccess(res, 'My tickets retrieved successfully', { tickets });
    } catch (error) {
        logger.error('[Support] Error fetching my tickets:', error);
        sendError(res, 'Failed to fetch tickets', 500);
    }
});

// @desc    Update ticket status
// @route   PATCH /api/support/:id/status
// @access  Private (Admin)
export const updateTicketStatus = asyncHandler(async (req, res) => {
    try {
        const id = assertObjectId(req.params.id, 'ticket id');
        const status = pickEnum(req.body.status, ['open', 'in_progress', 'resolved', 'closed']);
        if (!status) {
            return sendError(res, 'Invalid ticket status. Must be open, in_progress, resolved, or closed', 400);
        }

        const ticket = await HelpTicket.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!ticket) {
            return sendError(res, 'Ticket not found', 404);
        }

        sendSuccess(res, 'Ticket status updated successfully', { ticket });
    } catch (error) {
        if (error.statusCode) {
            return sendError(res, error.message, error.statusCode);
        }
        logger.error('[Support] Error updating ticket status:', error);
        sendError(res, 'Failed to update status', 500);
    }
});
