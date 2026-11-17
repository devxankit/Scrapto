import mongoose from 'mongoose';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import Order from '../models/Order.js';
import Referral from '../models/Referral.js';
import ReferralSetting from '../models/ReferralSetting.js';
import ReferralTier from '../models/ReferralTier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { ORDER_STATUS, USER_ROLES } from '../config/constants.js';

/**
 * User-facing, READ-ONLY referral views for the mobile apps.
 *
 * These endpoints only report facts the database already holds:
 *   - the caller's referral code (User.referralCode, generated on save)
 *   - who registered with it (User.referredBy, set by authController.register)
 *   - the reward amounts and tiers an admin configured (ReferralSetting/Tier)
 *   - rewards actually paid (Referral.rewardEarned where rewardStatus = 'paid')
 *
 * NOTE: no code path creates Referral documents or pays referral rewards today.
 * The configured amounts are advertised but never credited, so `earned` is
 * truthfully 0 until a reward engine exists. These endpoints deliberately do
 * not invent that payout logic, and they never write (the admin settings
 * endpoint creates a default document; this one uses in-memory defaults).
 */

const LEADERBOARD_SIZE = 10;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** First instant of the current calendar month in India Standard Time. */
const istMonthStart = (now = new Date()) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
};

const monthLabel = (now = new Date()) =>
  new Date(now.getTime() + IST_OFFSET_MS).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' });

/** "Asha Verma" -> "Asha V." — other people's full names are not shown. */
const maskName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Member';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Settings as configured, or the schema defaults without persisting them. */
const loadSettings = async () =>
  (await ReferralSetting.findOne().lean()) || new ReferralSetting().toObject();

/**
 * Tier progress for the referral card. Returns null when no tiers are
 * configured, so the app hides the card instead of inventing a ladder.
 */
const tierProgress = async (monthlyJoined) => {
  const tiers = await ReferralTier.find({ isActive: true }).sort({ minReferrals: 1 }).lean();
  if (!tiers.length) return null;

  const current = [...tiers].reverse().find((t) => t.minReferrals <= monthlyJoined) || null;
  const next = tiers.find((t) => t.minReferrals > monthlyJoined) || null;

  return {
    name: current ? titleCase(current.name) : 'Unranked',
    next: next ? titleCase(next.name) : null,
    needed: next ? next.minReferrals - monthlyJoined : 0,
    bonus: next ? next.monthlyBonus || 0 : current?.monthlyBonus || 0
  };
};

// @desc    My referral code, configured rewards, referees and tier progress
// @route   GET /api/v1/referrals/me
// @access  Private (user, scrapper)
export const getMyReferrals = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('referralCode role').lean();
  if (!me) return sendError(res, 'User not found', 404);

  const settings = await loadSettings();
  const rewards = me.role === USER_ROLES.SCRAPPER ? settings.scrapperRewards : settings.userRewards;

  const referees = await User.find({ referredBy: me._id })
    .select('name createdAt isPhoneVerified')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const ids = referees.map((r) => r._id);

  // Who has finished at least one pickup, and which rewards were really paid.
  const [completedIds, paid] = await Promise.all([
    ids.length ? Order.distinct('user', { user: { $in: ids }, status: ORDER_STATUS.COMPLETED }) : [],
    Referral.find({ referrer: me._id, rewardStatus: 'paid' }).select('referee rewardEarned').lean()
  ]);
  const completed = new Set(completedIds.map(String));
  const paidByReferee = new Map(paid.map((p) => [String(p.referee), Number(p.rewardEarned) || 0]));

  const monthStart = istMonthStart();
  const monthlyJoined = referees.filter((r) => r.isPhoneVerified && r.createdAt >= monthStart).length;

  sendSuccess(res, 'Referral details fetched successfully', {
    code: me.referralCode || null,
    enabled: settings.enabled !== false,
    rewardPerReferral: Number(rewards?.signupBonus) || 0,
    friendReward: Number(rewards?.refereeWelcomeBonus) || 0,
    totals: {
      // Registered with my code (no invite log exists, so "invited" = signed up).
      invited: referees.length,
      // Verified their phone, i.e. a real account.
      joined: referees.filter((r) => r.isPhoneVerified).length,
      // Rewards actually paid. 0 while no payout engine exists.
      earned: paid.reduce((s, p) => s + (Number(p.rewardEarned) || 0), 0)
    },
    tier: await tierProgress(monthlyJoined),
    referrals: referees.map((r) => ({
      name: maskName(r.name),
      status: completed.has(String(r._id)) ? 'completed' : 'joined',
      reward: paidByReferee.get(String(r._id)) || 0,
      createdAt: r.createdAt
    }))
  });
});

// @desc    This month's referral leaderboard for the caller's role
// @route   GET /api/v1/referrals/leaderboard
// @access  Private (user, scrapper)
export const getReferralLeaderboard = asyncHandler(async (req, res) => {
  const role = req.user.role === USER_ROLES.SCRAPPER ? USER_ROLES.SCRAPPER : USER_ROLES.USER;
  const monthStart = istMonthStart();

  // Referrals that joined this month, grouped by referrer.
  const counts = await User.aggregate([
    { $match: { referredBy: { $ne: null }, isPhoneVerified: true, createdAt: { $gte: monthStart } } },
    { $group: { _id: '$referredBy', referrals: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'referrer' } },
    { $unwind: '$referrer' },
    { $match: { 'referrer.role': role, 'referrer.isActive': { $ne: false } } },
    { $project: { referrals: 1, name: '$referrer.name', address: '$referrer.address', addresses: '$referrer.addresses' } }
  ]);

  const meId = new mongoose.Types.ObjectId(String(req.user.id));
  const ids = [...counts.map((c) => c._id), meId];

  // Weight recycled this month: sold (users) or collected (scrappers).
  const ownerField = role === USER_ROLES.SCRAPPER ? 'scrapper' : 'user';
  const kgRows = await Order.aggregate([
    {
      $match: {
        [ownerField]: { $in: ids },
        status: ORDER_STATUS.COMPLETED,
        updatedAt: { $gte: monthStart }
      }
    },
    { $group: { _id: `$${ownerField}`, kg: { $sum: { $ifNull: ['$totalWeight', 0] } } } }
  ]);
  const kgBy = new Map(kgRows.map((k) => [String(k._id), Math.round(k.kg)]));

  // City: scrapper profile, else default saved address, else legacy address.
  const scrapperCity = role === USER_ROLES.SCRAPPER
    ? new Map((await Scrapper.find({ _id: { $in: ids } }).select('city').lean()).map((s) => [String(s._id), s.city]))
    : new Map();
  const cityOf = (c) =>
    scrapperCity.get(String(c._id))
    || (c.addresses || []).find((a) => a.isDefault)?.city
    || c.address?.city
    || '';

  const ranked = counts
    .map((c) => ({ id: String(c._id), name: c.name, city: cityOf(c), referrals: c.referrals, kg: kgBy.get(String(c._id)) || 0 }))
    .sort((a, b) => b.referrals - a.referrals || b.kg - a.kg);

  const myIndex = ranked.findIndex((r) => r.id === String(meId));
  const myReferrals = myIndex >= 0 ? ranked[myIndex].referrals : 0;
  const me = await User.findById(meId).select('name').lean();

  sendSuccess(res, 'Leaderboard fetched successfully', {
    month: monthLabel(),
    leaders: ranked.slice(0, LEADERBOARD_SIZE).map((r, i) => ({
      rank: i + 1,
      name: maskName(r.name),
      city: r.city,
      referrals: r.referrals,
      kg: r.kg
    })),
    me: {
      // Not on the board yet: ranked after everyone who has referred someone.
      rank: myIndex >= 0 ? myIndex + 1 : ranked.filter((r) => r.referrals > myReferrals).length + 1,
      name: me?.name || '',
      referrals: myReferrals,
      kg: kgBy.get(String(meId)) || 0
    }
  });
});
