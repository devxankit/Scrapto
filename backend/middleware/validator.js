import { validationResult } from 'express-validator';
import logger from '../utils/logger.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const firstMsg = errorList.map(e => `${e.path ? e.path + ': ' : ''}${e.msg}`).join(', ');
    logger.warn('[validator] Request validation failed', { url: req.originalUrl, errors: errorList });
    return res.status(400).json({
      success: false,
      message: firstMsg,
      error: firstMsg,
      errors: errorList
    });
  }
  
  next();
};

