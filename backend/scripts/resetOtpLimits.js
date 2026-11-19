import mongoose from 'mongoose';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function reset() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const res = await db.collection('users').updateMany(
    {},
    {
      $set: {
        otpSendCount: 0,
        otpAttempts: 0,
        otpLastSentAt: null,
        otpSendWindowStart: null,
        failedLoginAttempts: 0,
        lockUntil: null
      }
    }
  );

  console.log(`✅ Successfully reset OTP limits and counters for ${res.modifiedCount} accounts in MongoDB Atlas!`);
  await mongoose.disconnect();
}

reset().catch(err => {
  console.error(err);
  process.exit(1);
});
