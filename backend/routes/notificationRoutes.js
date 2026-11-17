import express from 'express';
import { protect } from '../middleware/auth.js';
import {
    deleteNotification,
    getMyNotifications,
    getUnreadCount,
    markNotificationsRead,
    markOneRead
} from '../controllers/notificationController.js';

const router = express.Router();

// In-app notification history for any signed-in account (user or scrapper).
router.use(protect);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/read', markNotificationsRead);
router.post('/read', markNotificationsRead);
router.put('/:id/read', markOneRead);
router.delete('/:id', deleteNotification);

export default router;
