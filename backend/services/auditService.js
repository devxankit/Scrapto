import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Append-only audit trail for privileged and financial actions.
 * Never throws: an audit failure is logged but must not break the action
 * (the action itself already has its own ledger/state records).
 */
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actorRole: { type: String, default: null },
  action: { type: String, required: true, index: true },
  targetType: { type: String, default: null },
  targetId: { type: String, default: null },
  metadata: { type: Object, default: {} },
  ip: { type: String, default: null }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const SENSITIVE = /password|otp|token|secret|aadhaar|signature|account/i;

const scrubMetadata = (metadata = {}) => {
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE.test(key)) continue;
    out[key] = typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;
  }
  return out;
};

export const recordAudit = async ({ actorId, actorRole, action, targetType, targetId, metadata, ip }) => {
  try {
    await AuditLog.create({
      actorId: actorId || null,
      actorRole: actorRole || null,
      action,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      metadata: scrubMetadata(metadata),
      ip: ip || null
    });
  } catch (error) {
    logger.error('[audit] failed to record audit entry', { action, error: error.message });
  }
};

export const listAudits = async ({ page = 1, limit = 50, action, actorId, targetType, targetId }) => {
  const filter = {};
  if (action) filter.action = action;
  if (actorId) filter.actorId = actorId;
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = String(targetId);
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  return { entries, total };
};
