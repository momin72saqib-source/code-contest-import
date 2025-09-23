const mongoose = require('mongoose');

// Ensure single MongoDB connection
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    console.log('⚡ Using existing MongoDB connection');
    return;
  }

  try {
    // Ensure MONGO_URI is provided
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is required in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.warn('⚠️  Running in development mode without database connection');
    console.warn('⚠️  API endpoints may return mock data or errors');
    // Don't exit in development - allow frontend to work
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;