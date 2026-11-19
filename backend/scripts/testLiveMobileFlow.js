import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:7000/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: json };
}

async function run() {
  const args = process.argv.slice(2);
  const getArg = (key) => {
    const idx = args.indexOf(key);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const phone = getArg('--phone');
  const otp = getArg('--otp');
  const sendOnly = args.includes('--send-only');
  const role = getArg('--role') || 'user';

  if (!phone) {
    console.error('Usage: node scripts/testLiveMobileFlow.js --phone <10-digit-phone> [--send-only] [--otp <6-digit-otp>] [--role user|scrapper]');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`📱 SCRAPTO LIVE MOBILE DEVICE FLOW TEST`);
  console.log(`🎯 Phone: ${phone} | Target Role: ${role} | Base: ${BASE_URL}`);
  console.log(`======================================================\n`);

  // Step 1: Send OTP
  console.log(`[Step 1] Requesting OTP for ${phone}...`);
  const sendRes = await request('/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ phone })
  });

  console.log(`Response Status: ${sendRes.status}`, sendRes.body);

  if (!sendRes.ok) {
    console.error(`❌ Failed to send OTP: ${sendRes.body.message || 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`✅ OTP sent successfully!`);

  if (sendOnly || !otp) {
    console.log(`\n👉 Please provide the OTP received on mobile using:`);
    console.log(`   node scripts/testLiveMobileFlow.js --phone ${phone} --otp <YOUR_OTP> --role ${role}\n`);
    process.exit(0);
  }

  // Step 2: Verify OTP
  console.log(`\n[Step 2] Verifying OTP ${otp} for ${phone}...`);
  const verifyRes = await request('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp, role })
  });

  console.log(`Response Status: ${verifyRes.status}`, verifyRes.body);

  if (!verifyRes.ok) {
    console.error(`❌ OTP Verification failed: ${verifyRes.body.message || 'Unknown error'}`);
    process.exit(1);
  }

  const token = verifyRes.body.data?.token;
  const user = verifyRes.body.data?.user;
  console.log(`✅ OTP Verified! Authenticated as ${user?.role || role} (${user?.name || 'User'})`);
  console.log(`🔑 Access Token: ${token ? token.substring(0, 25) + '...' : 'NONE'}`);

  // Step 3: Fetch Profile
  console.log(`\n[Step 3] Fetching Me Profile...`);
  const meRes = await request('/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`User Profile:`, meRes.body.data || meRes.body);

  // Step 4: Scrap Prices & Public Data
  console.log(`\n[Step 4] Fetching Live Scrap Prices...`);
  const pricesRes = await request('/public/prices');
  const categories = pricesRes.body?.data?.prices || [];
  console.log(`Found ${categories.length} live scrap categories in catalog.`);

  console.log(`\n🎉 Step 1-4 completed successfully for ${phone}! Ready for full E2E order flow.`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
