
import mongoose from 'mongoose';

// ==========================================
// MONGODB CONNECTION CACHE
// Supports local development and Vercel
// ==========================================

const cached =
  globalThis.mongooseCache ||
  (globalThis.mongooseCache = {
    promise: null
  });

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  // Check environment configuration
  if (!MONGO_URI) {
    throw new Error('MONGO_URI environment variable is not defined.');
  }

  // Reuse an existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Reuse an ongoing connection attempt
  if (mongoose.connection.readyState === 2 && cached.promise) {
    return cached.promise;
  }

  // Reset stale connection promise
  if (mongoose.connection.readyState === 0) {
    cached.promise = null;
  }

  // Establish a new connection
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    })
      .then(() => {
        console.log(
          `MongoDB Connected: ${mongoose.connection.host}`
        );

        return mongoose.connection;
      })
      .catch((error) => {
        cached.promise = null;

        console.error(
          'MongoDB connection failed:',
          error.message
        );

        throw error;
      });
  }

  return cached.promise;
};

export default connectDB;
