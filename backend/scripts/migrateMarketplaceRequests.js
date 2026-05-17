/**
 * One-time migration script:
 * Sets maxMarketplaceRequests on existing SubscriptionPlan documents
 * that don't have it set yet (i.e., value is null/undefined).
 *
 * Logic:
 *   - If plan has maxPickups set (e.g., Basic Plan → 50 pickups) → set maxMarketplaceRequests = 10
 *   - If plan has unlimited pickups (maxPickups = null) → set maxMarketplaceRequests = null (unlimited)
 *
 * Run once: node scripts/migrateMarketplaceRequests.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { connectDB } from '../config/database.js';
import logger from '../utils/logger.js';

dotenv.config();

const migrate = async () => {
  try {
    await connectDB();
    logger.info('✅ Database connected');

    // Find all plans that do NOT have maxMarketplaceRequests set
    const plans = await SubscriptionPlan.find({
      maxMarketplaceRequests: { $exists: false }
    });

    // Also find plans where it exists but was never set (null from old schema)
    const plansWithNull = await SubscriptionPlan.find({
      maxMarketplaceRequests: null
    });

    const allPlans = [...plans, ...plansWithNull];
    // Deduplicate by ID
    const uniquePlans = allPlans.filter(
      (plan, index, self) => self.findIndex(p => p._id.equals(plan._id)) === index
    );

    logger.info(`📦 Found ${uniquePlans.length} plans to migrate`);

    let updated = 0;
    for (const plan of uniquePlans) {
      // If plan has a pickup limit → give proportional marketplace limit
      // If plan is unlimited pickups → unlimited marketplace too
      const marketplaceLimit = plan.maxPickups !== null ? 10 : null;

      await SubscriptionPlan.updateOne(
        { _id: plan._id },
        { $set: { maxMarketplaceRequests: marketplaceLimit } }
      );

      logger.info(
        `✅ Updated "${plan.name}" → maxMarketplaceRequests: ${marketplaceLimit === null ? 'Unlimited' : marketplaceLimit}`
      );
      updated++;
    }

    logger.info(`✅ Migration complete. Updated ${updated} plans.`);
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrate();
