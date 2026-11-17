import Notification from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';

const MAX_LIMIT = 50;

// @desc    List my notifications (newest first)
// @route   GET /api/v1/notifications
// @access  Private
export const getMyNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { recipient: req.user.id };
  if (req.query.unread === 'true') filter.read = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user.id, read: false })
  ]);

  sendSuccess(res, 'Notifications fetched successfully', {
    notifications,
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
  });
});

// @desc    Unread notification count
// @route   GET /api/v1/notifications/unread-count
// @access  Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ recipient: req.user.id, read: false });
  sendSuccess(res, 'Unread count fetched successfully', { unreadCount });
});

// @desc    Mark notifications read (all, or a given set of ids)
// @route   PUT /api/v1/notifications/read
// @access  Private
export const markNotificationsRead = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((v) => typeof v === 'string') : null;
  const filter = { recipient: req.user.id, read: false };
  if (ids && ids.length) filter._id = { $in: ids };

  const result = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });

  sendSuccess(res, 'Notifications marked as read', {
    updated: result.modifiedCount ?? 0,
    unreadCount: await Notification.countDocuments({ recipient: req.user.id, read: false })
  });
});

// @desc    Mark one notification read
// @route   PUT /api/v1/notifications/:id/read
// @access  Private
export const markOneRead = asyncHandler(async (req, res) => {
  const note = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user.id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!note) return sendError(res, 'Notification not found', 404);
  sendSuccess(res, 'Notification marked as read', { notification: note });
});

// @desc    Delete one of my notifications
// @route   DELETE /api/v1/notifications/:id
// @access  Private
export const deleteNotification = asyncHandler(async (req, res) => {
  const note = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user.id });
  if (!note) return sendError(res, 'Notification not found', 404);
  sendSuccess(res, 'Notification deleted successfully');
});
