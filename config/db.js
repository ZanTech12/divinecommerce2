
import mongoose from "mongoose";

// ==========================================
// MONGODB CONNECTION CACHE
// Supports local development and Vercel
// ==========================================

const cached =
  globalThis.mongooseCache ||
  (globalThis.mongooseCache = {
    promise: null
  });

// ==========================================
// CONNECTION CONFIGURATION
// ==========================================

const connectionOptions = {
  serverSelectionTimeoutMS: 10000,

  // Connection pool
  maxPoolSize: 10,
  minPoolSize: 0,

  // Avoid unnecessary buffering
  bufferCommands: false,

  // Keep connections healthy
  socketTimeoutMS: 45000,

  // Faster detection of inactive connections
  heartbeatFrequencyMS: 10000
};

// ==========================================
// DATABASE CONNECTION
// ==========================================

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    throw new Error(
      "MONGO_URI environment variable is not defined."
    );
  }

  // Already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Connection already in progress
  if (
    mongoose.connection.readyState === 2 &&
    cached.promise
  ) {
    return cached.promise;
  }

  // Disconnected or stale connection
  if (mongoose.connection.readyState === 0) {
    cached.promise = null;
  }

  // Create one shared connection attempt
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, connectionOptions)
      .then(() => {
        console.log(
          `MongoDB Connected: ${mongoose.connection.host}`
        );

        return mongoose.connection;
      })
      .catch(error => {
        cached.promise = null;

        console.error(
          "MongoDB connection failed:",
          error.message
        );

        throw error;
      });
  }

  return cached.promise;
};

// ==========================================
// CONNECTION EVENT HANDLERS
// ==========================================

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected.");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB reconnected.");
});

mongoose.connection.on("error", error => {
  console.error(
    "MongoDB connection error:",
    error.message
  );
});

// ==========================================
// EXPORT
// ==========================================

export default connectDB;
