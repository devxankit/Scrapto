import dns from 'dns';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Fallback to reliable public DNS resolvers if local router/ISP refuses SRV lookups
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Continue with default system resolvers
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URI_PROD);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

export { connectDB };

