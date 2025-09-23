const mongoose = require('mongoose');
require('dotenv').config();

const testMongoConnection = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connection successful!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ MongoDB connection closed.');
  }
};

testMongoConnection();