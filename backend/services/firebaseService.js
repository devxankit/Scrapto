import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');

let firebaseInitialized = false;

try {
    if (getApps().length > 0) {
        firebaseInitialized = true;
    } else if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
            credential: cert(serviceAccount)
        });
        firebaseInitialized = true;
        logger.info('✅ Firebase Admin initialized successfully');
    } else {
        logger.warn('⚠️ Firebase service account file not found. Push notifications will not work.');
    }
} catch (error) {
    logger.error('❌ Error initializing Firebase Admin:', error.message);
}

/**
 * Send push notification to multiple tokens
 * @param {string[]} tokens - Array of FCM tokens
 * @param {Object} payload - Notification payload { title, body, data }
 * @returns {Promise<Object>} - Firebase response
 */
export const sendPushNotification = async (tokens, payload) => {
    if (!tokens || tokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
    }

    if (!firebaseInitialized) {
        logger.warn('Push notification skipped: Firebase Admin not initialized.');
        return { successCount: 0, failureCount: tokens.length };
    }

    try {
        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data || {},
            tokens: tokens,
        };

        const response = await getMessaging().sendEachForMulticast(message);
        logger.info(`Successfully sent: ${response.successCount} messages. Failed: ${response.failureCount} messages.`);
        
        // Handle failed tokens (e.g., remove invalid tokens from DB)
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const error = resp.error;
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        // In a real app, you might want to return these to the caller to clean up DB
                        logger.warn(`Token at index ${idx} is invalid and should be removed`);
                    }
                }
            });
        }

        return response;
    } catch (error) {
        logger.error('Error sending push notification:', error);
        throw error;
    }
};
