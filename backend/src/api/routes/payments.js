const express = require('express');
const logger = require('../../utils/logger');

function createPaymentsRouter(orchestrator, intentManager) {
  const router = express.Router();

  /**
   * POST /api/payments/seat
   * Process a seat payment
   */
  router.post('/seat', async (req, res) => {
    try {
      const { masterCheckRef, rvcRef, seatItems, employeeRef } = req.body;

      // Validate required fields
      if (!masterCheckRef || !rvcRef || !seatItems || !employeeRef) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: masterCheckRef, rvcRef, seatItems, employeeRef'
        });
      }

      if (!Array.isArray(seatItems) || seatItems.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'seatItems must be a non-empty array'
        });
      }

      logger.info('Received seat payment request', {
        masterCheckRef,
        rvcRef,
        seatItemCount: seatItems.length
      });

      const result = await orchestrator.processSeatPayment(
        masterCheckRef,
        rvcRef,
        seatItems,
        employeeRef
      );

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Seat payment request failed', {
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
   * POST /api/payments/recover
   * Recover a stuck payment
   */
  router.post('/recover', async (req, res) => {
    try {
      const { intentId } = req.body;

      if (!intentId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required field: intentId'
        });
      }

      logger.info('Received payment recovery request', { intentId });

      const result = await orchestrator.recoverPayment(intentId);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Payment recovery failed', {
        error: error.message,
        intentId: req.body.intentId
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

  return router;
}

module.exports = createPaymentsRouter;
