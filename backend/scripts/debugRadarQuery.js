import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const scrapper = await db.collection('scrappers').findOne({ phone: '9876598765' });
console.log('scrapper _id:', scrapper._id);

const q1 = { status: 'pending', assignmentStatus: 'unassigned' };
console.log('q1 count:', await db.collection('orders').countDocuments(q1));

const [lng, lat] = scrapper.liveLocation?.coordinates || [0, 0];
console.log('Scrapper coords:', lng, lat);

const q2 = {
  status: 'pending',
  assignmentStatus: 'unassigned',
  location: {
    $geoWithin: {
      $centerSphere: [[lng, lat], 25 / 6378.1]
    }
  }
};
console.log('q2 count (geoWithin centerSphere):', await db.collection('orders').countDocuments(q2));

const q3 = { ...q2, skippedBy: { $ne: scrapper._id } };
console.log('q3 count (skippedBy):', await db.collection('orders').countDocuments(q3));

const q4 = { ...q3, orderType: { $in: [null, 'scrap_pickup', 'scrap', 'scrap_sell'] } };
console.log('q4 count (orderType):', await db.collection('orders').countDocuments(q4));

await mongoose.disconnect();
