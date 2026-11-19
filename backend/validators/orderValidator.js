import { body } from 'express-validator';
import { SCRAP_CATEGORIES, ORDER_STATUS, PAYMENT_STATUS, ORDER_TYPES, normalizeCategory } from '../config/constants.js';

export const createOrderValidator = [
  body('scrapItems')
    .if((value, { req }) => req.body.orderType !== ORDER_TYPES.CLEANING_SERVICE)
    .isArray({ min: 1 })
    .withMessage('At least one scrap item is required')
    .custom((items) => {
      items.forEach((item, index) => {
        if (!item.category) {
          throw new Error(`Item ${index + 1}: Category is required`);
        }
        // Admin price names are free text ("Copper"); match case-insensitively.
        item.category = normalizeCategory(item.category);
        if (!Object.values(SCRAP_CATEGORIES).includes(item.category)) {
          throw new Error(`Item ${index + 1}: Invalid category`);
        }
        const w = Number(item.weight);
        if (!Number.isFinite(w) || w <= 0) {
          throw new Error(`Item ${index + 1}: Weight must be greater than 0`);
        }
        item.weight = w;
        if (item.rate !== undefined && item.rate !== null && (Number(item.rate) < 0 || !Number.isFinite(Number(item.rate)))) {
          throw new Error(`Item ${index + 1}: Rate must be 0 or greater`);
        }
        if (item.total !== undefined && item.total !== null && (Number(item.total) < 0 || !Number.isFinite(Number(item.total)))) {
          throw new Error(`Item ${index + 1}: Total must be 0 or greater`);
        }
      });
      return true;
    }),

  body('pickupAddress')
    .optional({ nullable: true, checkFalsy: true })
    .isObject()
    .withMessage('Pickup address must be an object'),

  body('pickupAddress.street')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('pickupAddress.city')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('pickupAddress.pincode')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('pickupAddress.coordinates.lat')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  body('pickupAddress.coordinates.lng')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  body('preferredTime')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),

  body('pickupSlot')
    .optional({ nullable: true, checkFalsy: true })
    .custom((val) => {
      if (!val) return true;
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('Pickup slot must be an object');
      }
      return true;
    }),

  body('images')
    .optional({ nullable: true, checkFalsy: true })
    .isArray()
    .withMessage('Images must be an array'),

  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

export const updateOrderStatusValidator = [
  body('status')
    .optional()
    .isIn(Object.values(ORDER_STATUS))
    .withMessage('Invalid order status'),
  body('paymentStatus')
    .optional()
    .isIn(Object.values(PAYMENT_STATUS))
    .withMessage('Invalid payment status'),
  body('scrapItems')
    .optional()
    .isArray()
    .withMessage('scrapItems must be an array'),
  body().custom((value, { req }) => {
    const b = req.body || {};
    if (!b.status && !b.scrapItems && !b.paymentStatus && b.paidAmount === undefined && b.totalAmount === undefined) {
      throw new Error('At least one of status, scrapItems, paymentStatus, or amount is required');
    }
    return true;
  })
];

export const cancelOrderValidator = [
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason cannot exceed 200 characters')
];

export const updateOrderValidator = [
  body('scrapItems')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one scrap item is required'),

  body('pickupAddress')
    .optional()
    .isObject()
    .withMessage('Pickup address must be an object'),

  body('images')
    .optional()
    .isArray()
    .withMessage('Images must be an array'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

