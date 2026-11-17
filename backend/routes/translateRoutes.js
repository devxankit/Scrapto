import express from 'express';
import { translateText } from '../controllers/translateController.js';
import { translateRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Apply dedicated rate limiter to prevent abuse of external translation API
router.use(translateRateLimiter);

// POST /api/translate
router.post('/', translateText);

// POST /api/translate/batch - handled by same controller logic
router.post('/batch', translateText);

// POST /api/translate/object - handle object translation
router.post('/object', translateText);

export default router;
