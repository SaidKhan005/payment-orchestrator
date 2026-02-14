const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

const config = require('./config');
const logger = require('./utils/logger');

// Import components
const STSAuthClient = require('./auth/sts-auth');
const { SimphonyTenderOperations } = require('./simphony/tender-operations');
const PaymentIntentManager = require('./payment/intent-manager');
const { MockGatewayClient } = require('./payment/mock-gateway');
const { ElavonGateway } = require('./payment/elavon-gateway');
const LockManager = require('./payment/lock-manager');
const PaymentOrchestrator = require('./orchestrator');

// Import routes
const createPaymentsRouter = require('./api/routes/payments');
const createExceptionsRouter = require('./api/routes/exceptions');
const createProxyRouter = require('./api/routes/proxy');
const { apiKeyAuth } = require('./api/middleware/auth');

// Note: checks.js route removed - check-operations.js was deleted
// The new flow doesn't require check splitting/closing

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
let gatewayClient;
let lockManager;

async function initializeComponents() {
  try {
    logger.info('Initializing components...');

    // Test database connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection established');

    // Initialize auth client
    const authClient = new STSAuthClient(config.simphony);
    logger.info('STS auth client initialized');

    // Initialize Simphony tender operations
    const tenderOps = new SimphonyTenderOperations(config.simphony, authClient);
    logger.info('Simphony tender operations initialized');

    // Initialize payment intent manager
    intentManager = new PaymentIntentManager(pool);
    logger.info('Payment intent manager initialized');

    // Initialize lock manager
    lockManager = new LockManager(pool);
    logger.info('Lock manager initialized');

    // Initialize gateway client (mock or real Elavon)
    if (config.gateway.useMock) {
      gatewayClient = new MockGatewayClient(config.gateway);
      logger.info('Gateway client initialized (mode: MOCK)');
    } else if (config.elavon.merchantId) {
      gatewayClient = new ElavonGateway(config.elavon);
      logger.info('Gateway client initialized (mode: ELAVON CONVERGE)');
    } else {
      // Fallback to mock if no Elavon credentials
      logger.warn('No Elavon credentials configured, falling back to mock gateway');
      gatewayClient = new MockGatewayClient(config.gateway);
      logger.info('Gateway client initialized (mode: MOCK - fallback)');
    }

    // Initialize orchestrator with new constructor signature
    orchestrator = new PaymentOrchestrator(
      pool,              // db
      gatewayClient,     // gatewayClient
      tenderOps,         // simphonyTender
      lockManager,       // lockManager
      intentManager      // intentManager
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
    database: pool.totalCount > 0 ? 'connected' : 'disconnected',
    gateway: config.gateway.useMock ? 'mock' : 'elavon'
  });
});



// Proxy routes (main payment endpoint - protected with API key auth)
app.use('/api/proxy', apiKeyAuth, (req, res, next) => {
  const router = createProxyRouter(orchestrator, intentManager);
  router(req, res, next);
});

// Legacy payment routes (for backward compatibility)
app.use('/api/payments', apiKeyAuth, (req, res, next) => {
  const router = createPaymentsRouter(orchestrator, intentManager);
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

// Locks management endpoint (for debugging)
app.get('/api/locks', apiKeyAuth, async (req, res) => {
  try {
    const locks = await lockManager.getAllLocks();
    res.json({
      success: true,
      count: locks.length,
      locks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
    const gatewayMode = config.gateway.useMock ? 'MOCK' : (config.elavon.merchantId ? 'ELAVON' : 'MOCK');

    app.listen(port, () => {
      logger.info(`Payment Orchestrator server started`, {
        port,
        environment: config.server.env,
        gateway: gatewayMode
      });

      console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Payment Orchestrator - Idempotent Gateway Proxy         ║
╟───────────────────────────────────────────────────────────╢
║   Port:        ${String(port).padEnd(42)}║
║   Environment: ${config.server.env.padEnd(42)}║
║   Gateway:     ${gatewayMode.padEnd(42)}║
╟───────────────────────────────────────────────────────────╢
║   Endpoints:                                              ║
║   POST /api/proxy/payment     - Process payment           ║
║   GET  /api/proxy/payment/:id - Query payment status      ║
║   POST /api/proxy/reconcile   - Reconcile failed payment  ║
║   GET  /api/proxy/reconciliation-queue - View queue       ║
╚═══════════════════════════════════════════════════════════╝
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
