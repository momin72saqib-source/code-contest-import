// setupTests.js
const mongoose = require("mongoose");
const app = require("./backend/server"); // your refactored app export
const axios = require("axios");

// Hold server instance
let server;

// Mock Judge0 API so tests don’t hit real endpoints
jest.mock("axios");
axios.post.mockImplementation((url, data) => {
  if (url.includes("submissions")) {
    return Promise.resolve({
      data: {
        token: "mock-token",
        stdout: "Hello World",
        stderr: null,
        status: { description: "Accepted" },
      },
    });
  }
  return Promise.resolve({ data: {} });
});

// Global setup for Jest
beforeAll(async () => {
  // Start server on ephemeral port (random available port)
  server = app.listen(0);

  // Ensure DB connection
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
});

beforeEach(async () => {
  // Clear DB collections between tests
  const collections = Object.keys(mongoose.connection.collections);
  for (const collectionName of collections) {
    const collection = mongoose.connection.collections[collectionName];
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  // Close DB connection
  await mongoose.connection.close();

  // Close server
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});