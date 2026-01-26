const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

const config = require('./config');
const logger = require('./utils/logger');

// Import components
const STSAuthClient = require('./auth/sts-auth');
const SimphonyCheckOperations = require('./simphony/check-operations');
const { SimphonyTenderOperations } = require('./simphony/tender-operations');
const PaymentIntentManager = require('./payment/intent-manager');
const { MockGatewayClient } = require('./payment/mock-gateway');
const PaymentOrchestrator = require('./orchestrator');

// Import routes
const createPaymentsRouter = require('./api/routes/payments');
const createChecksRouter = require('./api/routes/checks');
const createExceptionsRouter = require('./api/routes/exceptions');
const { apiKeyAuth } = require('./api/middleware/auth');

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Database connection
const pool = new Pool({
  connectionString: config.database.connectionString
});

// Initialize components
let orchestrator;
let intentManager;
let checkOps;
let gatewayClient;

async function initializeComponents() {
  try {
    logger.info('Initializing components...');

    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection established');

    // Initialize auth client
    const authClient = new STSAuthClient(config.simphony);
    logger.info('STS auth client initialized');

    // Initialize Simphony operations
    checkOps = new SimphonyCheckOperations(config.simphony, authClient);
    const tenderOps = new SimphonyTenderOperations(config.simphony, authClient);
    logger.info('Simphony operations initialized');

    // Initialize payment intent manager
    intentManager = new PaymentIntentManager(pool);
    logger.info('Payment intent manager initialized');

    // Initialize gateway client
    gatewayClient = new MockGatewayClient(config.gateway);
    logger.info(`Gateway client initialized (mode: ${config.gateway.useMock ? 'MOCK' : 'PRODUCTION'})`);

    // Initialize orchestrator
    orchestrator = new PaymentOrchestrator(
      checkOps,
      tenderOps,
      intentManager,
      gatewayClient
    );
    logger.info('Payment orchestrator initialized');

    logger.info('All components initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize components', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.server.env,
    database: pool.totalCount > 0 ? 'connected' : 'disconnected'
  });
});

// API routes (protected with API key auth)
app.use('/api/payments', apiKeyAuth, (req, res, next) => {
  const router = createPaymentsRouter(orchestrator, intentManager);
  router(req, res, next);
});

app.use('/api/checks', apiKeyAuth, (req, res, next) => {
  const router = createChecksRouter(checkOps);
  router(req, res, next);
});

app.use('/api/exceptions', apiKeyAuth, (req, res, next) => {
  const router = createExceptionsRouter(intentManager);
  router(req, res, next);
});

// Mock gateway endpoints (for testing/debugging)
app.get('/api/mock/transactions', (req, res) => {
  if (!config.gateway.useMock) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Mock gateway not enabled'
    });
  }

  const transactions = gatewayClient.getAllTransactions();

  res.json({
    success: true,
    data: transactions,
    count: transactions.length
  });
});

app.post('/api/mock/reset', (req, res) => {
  if (!config.gateway.useMock) {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Mock gateway not enabled'
    });
  }

  gatewayClient.reset();

  res.json({
    success: true,
    message: 'Mock gateway reset successfully'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.server.env === 'development' ? err.message : 'An error occurred'
  });
});

// Start server
async function startServer() {
  try {
    await initializeComponents();

    const port = config.server.port;

    app.listen(port, () => {
      logger.info(`Payment Orchestrator server started`, {
        port,
        environment: config.server.env,
        mockGateway: config.gateway.useMock
      });

      console.log(`
╔═══════════════════════════════════════════════════════╗
║   Payment Orchestrator - Server Running              ║
╟───────────────────────────────────────────────────────╢
║   Port:        ${port}                                    ║
║   Environment: ${config.server.env.padEnd(35)}║
║   Gateway:     ${(config.gateway.useMock ? 'MOCK' : 'PRODUCTION').padEnd(35)}║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

// Start the server
startServer();
