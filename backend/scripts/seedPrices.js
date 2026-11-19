import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Price from '../models/Price.js';
import { PRICE_TYPES } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const PRICES = [
  { category: 'newspaper', pricePerKg: 14, price: 14 },
  { category: 'paper', pricePerKg: 12, price: 12 },
  { category: 'cardboard', pricePerKg: 10, price: 10 },
  { category: 'copper', pricePerKg: 450, price: 450 },
  { category: 'brass', pricePerKg: 320, price: 320 },
  { category: 'aluminium', pricePerKg: 110, price: 110 },
  { category: 'iron', pricePerKg: 28, price: 28 },
  { category: 'steel', pricePerKg: 38, price: 38 },
  { category: 'metal', pricePerKg: 30, price: 30 },
  { category: 'wire & cable', pricePerKg: 160, price: 160 },
  { category: 'plastic', pricePerKg: 14, price: 14 },
  { category: 'glass', pricePerKg: 4, price: 4 },
  { category: 'e-waste', pricePerKg: 45, price: 45 },
  { category: 'electronic', pricePerKg: 40, price: 40 },
  { category: 'battery', pricePerKg: 75, price: 75 },
  { category: 'split ac', pricePerKg: 0, price: 2500 },
  { category: 'refrigerator', pricePerKg: 0, price: 1200 },
  { category: 'washing machine', pricePerKg: 0, price: 900 },
  { category: 'cooler', pricePerKg: 0, price: 400 },
  { category: 'ceiling fan', pricePerKg: 0, price: 220 },
  { category: 'geyser', pricePerKg: 0, price: 350 },
  { category: 'microwave', pricePerKg: 0, price: 300 },
  { category: 'tv / monitor', pricePerKg: 0, price: 500 },
  { category: 'tyres', pricePerKg: 8, price: 8 },
  { category: 'old vehicle', pricePerKg: 32, price: 32 },
  { category: 'wooden furniture', pricePerKg: 6, price: 6 },
];

const seedPrices = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let created = 0;
    let updated = 0;

    for (const item of PRICES) {
      const existing = await Price.findOne({
        category: item.category,
        regionCode: 'IN-DL',
        isActive: true
      });

      if (existing) {
        existing.pricePerKg = item.pricePerKg;
        existing.price = item.price;
        existing.effectiveDate = new Date();
        await existing.save();
        updated++;
      } else {
        await Price.create({
          type: PRICE_TYPES.MATERIAL,
          category: item.category,
          pricePerKg: item.pricePerKg,
          price: item.price,
          regionCode: 'IN-DL',
          isActive: true,
          effectiveDate: new Date()
        });
        created++;
      }
    }

    console.log(`✅ Seeded prices for IN-DL: ${created} created, ${updated} updated.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding prices:', error);
    process.exit(1);
  }
};

seedPrices();
