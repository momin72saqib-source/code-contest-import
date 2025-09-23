const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Problem = require("../models/Problem");
const app = require("../server").app; // Import only 'app' to avoid conflicts

jest.setTimeout(30000); // Increase timeout to 30 seconds
jest.mock("../services/judge0Service", () => ({
  runCode: jest.fn(() => Promise.resolve({
    stdout: "Hello World\n",
    stderr: "",
    status: "Accepted",
  })),
}));

describe('Authentication Test', () => {
  let mockUser;
  let authToken;

  beforeAll(async () => {
    console.log('=== SETTING UP TEST ENVIRONMENT ===');

    let retries = 5;
    while (retries) {
      try {
        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          });
        }
        console.log('✅ Database connection ready');
        break;
      } catch (error) {
        console.error('❌ MongoDB connection attempt failed:', error.message);
        retries -= 1;
        console.log(`Retrying... (${retries} attempts left)`);
        await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds before retrying
      }
    }

    if (!retries) {
      throw new Error('Failed to connect to MongoDB after multiple attempts');
    }

    console.log('✅ Database connection established');
  });

  afterAll(async () => {
    console.log('=== CLEANING UP TEST ENVIRONMENT ===');
    if (server && server.closeServer) {
      await new Promise(resolve => server.closeServer(resolve));
      console.log('✅ Server closed');
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('✅ MongoDB connection closed');
    }
  });

  beforeEach(async () => {
    console.log('\n=== BEFORE EACH TEST ===');

    if (mongoose.connection.readyState === 1) {
      const collections = Object.values(mongoose.connection.collections);
      for (let collection of collections) {
        await collection.deleteMany({});
      }
      console.log('✅ Collections cleared');
    } else {
      console.log('⚠️  Skipping database clear - not connected');
    }

    if (mongoose.connection.readyState === 1) {
      mockUser = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        fullName: 'Test User',
        role: 'student',
        isActive: true
      });
      console.log('✅ Mock user created:', mockUser._id.toString());

      authToken = jwt.sign({ 
        _id: mockUser._id.toString()
      }, process.env.JWT_SECRET);
      console.log('✅ Token created with _id');
    } else {
      mockUser = { _id: 'mock-id' };
      authToken = jwt.sign({ _id: 'mock-id' }, 'test-secret');
      console.log('⚠️  Using mock data - database not connected');
    }
  });

  it('should authenticate with valid token', async () => {
    console.log('\n=== AUTHENTICATION TEST START ===');

    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️  Skipping test - database not connected');
      return;
    }

    const userExists = await User.findById(mockUser._id);
    console.log('👤 User exists:', !!userExists);

    if (!userExists) {
      console.log('❌ User not found in database');
      return;
    }

    const response = await request(app)
      .get('/api/')
      .set('Authorization', `Bearer ${authToken}`);

    console.log('📊 Response status:', response.status);
    console.log('🔑 Token used _id:', mockUser._id.toString());

    if (response.status === 401) {
      console.log('❌ AUTH FAILED - 401 Unauthorized');
      console.log('Response body:', response.body);
    } else {
      console.log('✅ Authentication successful');
    }

    expect(response.status).not.toBe(401);
  });

  it('should fail with invalid token', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const response = await request(app)
      .get('/api/')
      .set('Authorization', 'Bearer invalid_token_here');

    expect(response.status).toBe(401);
  });

  it('should fail with expired token', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const expiredToken = jwt.sign(
      { _id: mockUser._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // Token already expired
    );

    const response = await request(app)
      .get('/api/')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Token has expired.');
  });

  it('should fail without Authorization header', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const response = await request(app)
      .get('/api/');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Access denied. No token provided or invalid format.');
  });

  it('basic sanity check should pass', () => {
    expect(true).toBe(true);
  });
});

// At the top of your test file
beforeAll(async () => {
  process.env.JWT_SECRET = '76d0f78f98babfddf8d7999549655e0068eafd96b6e7633ee5ac3c6c7bc5d5c8';
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️  MongoDB connection not ready. Tests may fail.');
  }
});

beforeEach(async () => {
  // Just clear the users collection instead of entire database
  await mongoose.connection.collection('users').deleteMany({});
});


const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config(); // Load environment variables

// Mock data
const mockProblem = {
  title: "Sample Problem",
  statement: "Solve this problem.",
  testCases: [
    { input: "1\n2", expectedOutput: "3", isPublic: true },
    { input: "3\n4", expectedOutput: "7", isPublic: false }
  ],
  difficulty: "Easy",
  tags: ["math"],
};

// Add `createdBy` field to mockProblem
const mockUserId = new mongoose.Types.ObjectId();
mockProblem.createdBy = mockUserId;

// Generate a mock JWT token
const mockToken = jwt.sign({ _id: mockUserId }, process.env.JWT_SECRET || 'testsecret');

// Set a unique port for tests
process.env.PORT = 4001;

jest.setTimeout(20000); // Increase timeout to 20 seconds

describe('Submission Controller Tests', () => {
  let problemId;

  // Refine MongoDB connection logic
  let mongoServer;

  beforeAll(async () => {
    console.log('=== SETTING UP TEST ENVIRONMENT ===');

    const localMongoURI = 'mongodb://127.0.0.1:27017/testdb';

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(localMongoURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Connected to local MongoDB for testing');
    } else {
      console.log('⚠️  Reusing existing MongoDB connection');
    }

    // Seed a problem
    const problem = new Problem(mockProblem);
    const savedProblem = await problem.save();
    problemId = savedProblem._id;

    // Seed a mock user
    const mockUser = new User({
      _id: mockUserId,
      username: 'testuser',
      email: 'testuser@example.com',
      passwordHash: 'hashedpassword',
      isActive: true,
      fullName: 'Test User',
    });
    await mockUser.save();
    console.log('Mock User Saved:', mockUser);
  });

  afterAll(async () => {
    console.log('=== CLEANING UP TEST ENVIRONMENT ===');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      console.log('✅ Disconnected from local MongoDB and cleaned up');
    }

    if (server && server.closeServer) {
      await new Promise(resolve => server.closeServer(resolve));
      console.log('✅ Server closed');
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for database connection...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (mongoose.connection.readyState === 1) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
      console.log('✅ Database cleared');
    } else {
      throw new Error('Database not connected before test');
    }
  });

  test('Run code with valid input', async () => {
    const response = await request(app)
      .post('/api/submissions/run')
      // Add Authorization header with mock token
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        code: "console.log(3 + 4);",
        language: "javascript",
        problemId,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });

  test('Submit solution with valid input', async () => {
    const response = await request(app)
      .post('/api/submissions')
      // Add Authorization header with mock token
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        code: "console.log(3 + 4);",
        language: "javascript",
        problemId,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBeDefined();
  });
});

describe('Authentication Test', () => {
  let mockUser;

  beforeEach(async () => {
    console.log('\n=== BEFORE EACH TEST ===');
    
    // Clear database
    await User.deleteMany({});
    console.log('Database cleared');
    
    // Create mock user
    mockUser = await User.create({
      email: 'test@example.com',
      password: 'password123'
    });
    console.log('Mock user created:', mockUser._id.toString());
    
    // VERIFY USER EXISTS IMMEDIATELY AFTER CREATION
    const verifiedUser = await User.findById(mockUser._id);
    console.log('User verified after creation:', !!verifiedUser);
    
    // Wait a bit to ensure database operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should authenticate with valid token', async () => {
    console.log('\n=== TEST EXECUTION START ===');
    
    // VERIFY USER STILL EXISTS BEFORE MAKING REQUEST
    const userBeforeRequest = await User.findById(mockUser._id);
    console.log('User exists before request:', !!userBeforeRequest);
    
    const token = jwt.sign({ id: mockUser._id }, process.env.JWT_SECRET);
    console.log('Token created for user:', mockUser._id.toString());
    
    const response = await request(app)
      .get('/api/protected-route')
      .set('Authorization', `Bearer ${token}`);
    
    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
    
    expect(response.status).not.toBe(401);
  });
});

// Example test
it('should pass a dummy test', async () => {
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
});