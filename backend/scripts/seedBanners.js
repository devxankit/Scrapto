import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Banner from '../models/Banner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BANNERS = [
  {
    title: 'Free doorstep pickup',
    subtitle: 'Weighed at your door, paid on UPI',
    image: 'bannerPickup',
    imageUrl: 'bannerPickup',
    link: 'sell',
    targetAudience: 'both',
    displayOrder: 1,
    isActive: true
  },
  {
    title: 'Best market rates',
    subtitle: 'Live transparent prices updated daily',
    image: 'bannerRates',
    imageUrl: 'bannerRates',
    link: 'rates',
    targetAudience: 'both',
    displayOrder: 2,
    isActive: true
  },
  {
    title: 'Instant UPI payout',
    subtitle: 'Direct transfer to your bank account',
    image: 'bannerUpi',
    imageUrl: 'bannerUpi',
    link: 'wallet',
    targetAudience: 'both',
    displayOrder: 3,
    isActive: true
  }
];

const seedBanners = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let created = 0;
    for (const b of BANNERS) {
      const existing = await Banner.findOne({ title: b.title });
      if (!existing) {
        await Banner.create(b);
        created++;
      }
    }

    console.log(`✅ Seeded ${created} banners.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding banners:', error);
    process.exit(1);
  }
};

seedBanners();
