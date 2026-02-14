const express = require('express');
const logger = require('../../utils/logger');

function createPaymentsRouter(orchestrator, intentManager) {
  const router = express.Router();

  /**
   * POST /api/payments/process
   * Process a payment using the new atomic gateway + tender flow
   *
   * This is an alternative to /api/proxy/payment for clients
   * that prefer the /api/payments namespace.
   */
  router.post('/process', async (req, res) => {
    try {
      const {
        checkRef,
        rvcRef,
        amount,
        cardToken,
        merchantReference,
        tenderMediaRef,
        description
      } = req.body;

      // Validate required fields
      const missingFields = [];
      if (!checkRef) missingFields.push('checkRef');
      if (!rvcRef) missingFields.push('rvcRef');
      if (!amount) missingFields.push('amount');
      if (!cardToken) missingFields.push('cardToken');
      if (!merchantReference) missingFields.push('merchantReference');
      if (!tenderMediaRef) missingFields.push('tenderMediaRef');

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // Amount validation
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Amount must be a positive number'
        });
      }

      logger.info('Received payment request', {
        checkRef,
        rvcRef,
        amount: parsedAmount,
        merchantReference
      });

      const result = await orchestrator.processPayment({
        checkRef,
        rvcRef,
        amount: parsedAmount,
        cardToken,
        merchantReference,
        tenderMediaRef,
        description
      });

      const statusCode = result.success ? 200 : (result.needsReconciliation ? 500 : 400);

      res.status(statusCode).json({
        success: result.success,
        data: result
      });
    } catch (error) {
      logger.error('Payment request failed', {
        error: error.message,
        body: req.body
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/payments/:intentId
   * Get payment intent details
   */
  router.get('/:intentId', async (req, res) => {
    try {
      const { intentId } = req.params;

      const intent = await intentManager.getIntent(intentId);

      res.status(200).json({
        success: true,
        data: intent
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Payment intent not found'
        });
      }

      logger.error('Failed to get payment intent', {
        error: error.message,
        intentId: req.params.intentId
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/payments
   * List payment intents
   */
  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const state = req.query.state || null;

      const intents = await intentManager.listIntents(limit, state);

      res.status(200).json({
        success: true,
        data: intents,
        count: intents.length
      });
    } catch (error) {
      logger.error('Failed to list payment intents', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/payments/reconciliation/queue
   * Get payments needing reconciliation
   */
  router.get('/reconciliation/queue', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;

      const intents = await intentManager.getIntentsNeedingReconciliation(limit);

      res.status(200).json({
        success: true,
        data: intents,
        count: intents.length
      });
    } catch (error) {
      logger.error('Failed to get reconciliation queue', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * POST /api/payments/:intentId/reconcile
   * Mark a payment as reconciled
   */
  router.post('/:intentId/reconcile', async (req, res) => {
    try {
      const { intentId } = req.params;
      const { resolution } = req.body;

      if (!resolution || !['tender_posted', 'voided'].includes(resolution)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Resolution must be "tender_posted" or "voided"'
        });
      }

      const result = await orchestrator.markReconciled(intentId, resolution);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Reconciliation failed', {
        error: error.message,
        intentId: req.params.intentId
      });

      const status = error.message.includes('not found') ? 404 : 400;

      res.status(status).json({
        error: status === 404 ? 'Not Found' : 'Bad Request',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createPaymentsRouter;
