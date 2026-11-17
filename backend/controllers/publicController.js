import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Price from '../models/Price.js';
import SystemSetting from '../models/SystemSetting.js';
import logger from '../utils/logger.js';

// @desc    Get all active public prices
// @route   GET /api/public/prices
// @access  Public
export const getPublicPrices = asyncHandler(async (req, res) => {
    try {
        // Only fetch active prices
        // Get distinct categories first to avoid duplicates if multiple regions exist (simplification for now)
        // Or just get all active prices for default region (IN-DL) or all regions if specific query

        const filter = { isActive: true };
        if (req.query.regionCode) {
            filter.regionCode = req.query.regionCode;
        } else {
            // Default to IN-DL or just show all unique categories?
            // Let's default to 'IN-DL' to be consistent with default creation
            filter.regionCode = 'IN-DL';
        }

        const prices = await Price.find(filter)
            .select('category pricePerKg price type regionCode effectiveDate updatedAt image')
            .sort({ category: 1 });

        sendSuccess(res, 'Public prices retrieved successfully', { prices });
    } catch (error) {
        logger.error('[Public] Error fetching prices:', error);
        sendError(res, 'Failed to fetch prices', 500);
    }
});

const ALLOWED_PUBLIC_SETTINGS = new Set([
    'scrapper_tutorial_video',
    'min_wallet_balance_for_orders',
    'scrap_commission_percentage',
    'app_version',
    'terms_and_conditions'
]);

// @desc    Get system setting by key
// @route   GET /api/public/settings/:key
// @access  Public
export const getSystemSetting = asyncHandler(async (req, res) => {
    try {
        const { key } = req.params;
        if (!key || typeof key !== 'string' || !ALLOWED_PUBLIC_SETTINGS.has(key)) {
            return sendError(res, 'Setting not found', 404);
        }

        const setting = await SystemSetting.findOne({ key }).select('key value description -_id');

        if (!setting) {
            return sendError(res, 'Setting not found', 404);
        }

        sendSuccess(res, 'Setting retrieved successfully', { setting });
    } catch (error) {
        logger.error(`[Public] Error fetching setting ${req.params.key}:`, error);
        sendError(res, 'Failed to fetch setting', 500);
    }
});
