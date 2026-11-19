import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const users = await db.collection('users').find({}, { 
    projection: { name: 1, phone: 1, email: 1, role: 1, isPhoneVerified: 1, isBlocked: 1, createdAt: 1 } 
  }).sort({ createdAt: -1 }).limit(25).toArray();

  const scrappers = await db.collection('scrappers').find({}, {
    projection: { user: 1, businessName: 1, isVerified: 1, isOnline: 1, rating: 1, totalRatings: 1 }
  }).toArray();

  console.log(`=== FOUND ${users.length} REGISTERED USERS/ACCOUNTS ===`);
  users.forEach((u, idx) => {
    console.log(`${idx + 1}. [${u.role?.toUpperCase() || 'USER'}] Phone: ${u.phone} | Name: ${u.name || 'N/A'} | Verified: ${u.isPhoneVerified} | ID: ${u._id}`);
  });

  console.log(`\n=== FOUND ${scrappers.length} SCRAPPER PROFILES ===`);
  scrappers.forEach((s, idx) => {
    console.log(`${idx + 1}. Scrapper ID: ${s._id} | User: ${s.user} | Business: ${s.businessName || 'N/A'} | Verified: ${s.isVerified} | Online: ${s.isOnline}`);
  });

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
