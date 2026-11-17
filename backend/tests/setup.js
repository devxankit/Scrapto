import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Razorpay from 'razorpay';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Isolated test configuration. NEVER touches the configured production database.
dotenv.config({ path: path.join(__dirname, '../.env.test'), override: true });
process.env.NODE_ENV = 'test';

// In-process mock for Razorpay gateway calls in the test harness
const origAddResources = Razorpay.prototype.addResources;
Razorpay.prototype.addResources = function () {
  origAddResources.call(this);
  const origCreate = this.orders.create;
  this.orders.create = async (params) => {
    return {
      id: `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: params.amount,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      notes: params.notes,
      status: 'created'
    };
  };
};

let replSet;

/**
 * Start an isolated in-process MongoDB replica set (transactions supported)
 * and connect mongoose to it.
 */
export const startTestDb = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  const uri = replSet.getUri('scrapto_test');
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  return mongoose.connection;
};

export const stopTestDb = async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
};

/** Remove all documents between tests while keeping indexes. */
export const clearTestDb = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
};

/** Ensure unique/partial indexes exist (idempotency guarantees depend on them). */
export const syncIndexes = async () => {
  const models = mongoose.modelNames().map((n) => mongoose.model(n));
  for (const model of models) {
    try {
      await model.syncIndexes();
    } catch {
      // index conflicts between tests are not fatal
    }
  }
};
