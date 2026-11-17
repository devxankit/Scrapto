import mongoose from 'mongoose';

/**
 * In-app notification history.
 *
 * Push delivery (FCM) is fire-and-forget and leaves no record, so the mobile
 * apps had no list to render. Every push sent through
 * utils/pushNotificationHelper.js is also persisted here so the bell icon and
 * the Notifications screen reflect real backend events.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Recipient. May reference a User or a Scrapper document, matching the
    // loose coupling already used by sendNotificationToUser().
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140
    },
    body: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },
    // Free-form payload mirroring the FCM `data` block (orderId, type, ...).
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Newest-first listing per recipient, and unread-count lookups.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

// Keep history bounded without a cron job.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
