require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const connectDB = require('./config/database');
const apiRoutes = require('./routes');
const LeaderboardSocket = require('./sockets/leaderboardSocket');

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket
const leaderboardSocket = new LeaderboardSocket(server);

// Make WebSocket globally accessible for other modules
global.leaderboardSocket = leaderboardSocket;

// Connect to MongoDB
connectDB();

// Middleware - CORS FIRST (Allow all origins in development)
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());

// Rate limiting (skip OPTIONS preflight requests)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.method === 'OPTIONS', // Skip preflight requests
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later'
  }
});

// Apply rate limiting to all requests
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
// Around line 55-65 in server.js - Update the authLimiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 100, // 100 attempts in development
  skip: (req) => req.method === 'OPTIONS',
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later'
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (important for Replit)
app.set('trust proxy', 1);

// API routes
app.use('/api', apiRoutes);

// WebSocket endpoint info
app.get('/websocket', (req, res) => {
  res.json({
    success: true,
    message: 'WebSocket server is running',
    endpoints: [
      'ws://localhost:3001/contest/{contestId}/leaderboard',
      'ws://localhost:3001/contest/{contestId}/submissions',
      'ws://localhost:3001/notifications'
    ],
    events: {
      client_to_server: [
        'join_contest',
        'leave_contest',
        'join_submission_feed',
        'leave_submission_feed'
      ],
      server_to_client: [
        'leaderboard_update',
        'new_submission',
        'contest_update',
        'notification',
        'error'
      ]
    }
  });
});

// Serve uploaded files
app.use('/uploads', express.static(process.env.UPLOAD_PATH || './uploads'));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    availableEndpoints: [
      '/api/auth',
      '/api/contests',
      '/api/problems',
      '/api/submissions',
      '/api/leaderboard',
      '/api/analytics',
      '/api/plagiarism',
      '/api/upload'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: errors
    });
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: `${field} already exists`
    });
  }

  // Multer file upload errors
  if (error instanceof require('multer').MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files'
      });
    }
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? 
      error.message : 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket server running on port ${PORT}`);
  console.log(`📁 File uploads directory: ${process.env.UPLOAD_PATH || './uploads'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export for testing or external use
module.exports = { app, server, leaderboardSocket };