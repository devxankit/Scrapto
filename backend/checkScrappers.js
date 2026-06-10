import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

const scrapperSchema = new mongoose.Schema({
  name: String,
  city: String,
  phone: String,
  email: String
}, { strict: false });

const Scrapper = mongoose.model('Scrapper', scrapperSchema);

async function check() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    const scrappers = await Scrapper.find({
      city: { $regex: /gurugram|gurgaon/i }
    }).select('name city phone email');
    
    console.log(`Found ${scrappers.length} scrappers in Gurugram/Gurgaon:`);
    console.log(JSON.stringify(scrappers, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from DB');
  }
}

check();
