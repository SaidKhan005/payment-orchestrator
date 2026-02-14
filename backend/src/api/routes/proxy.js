const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create Payment Proxy Router
 *
 * Ethor calls this instead of calling Elavon + Simphony separately.
 * Provides atomic gateway + tender posting with idempotency.
 *
 * @param {PaymentOrchestrator} orchestrator - The payment orchestrator instance
 * @param {PaymentIntentManager} intentManager - The intent manager for queries
 */
function createProxyRouter(orchestrator, intentManager) {
  const router = express.Router();

  /**
   * POST /proxy/payment
   *
   * Process a payment atomically:
   * 1. Authorize with gateway (Elavon)
   * 2. Post tender to Simphony
   *
   * Idempotent: Uses merchantReference to detect duplicate requests.
   * If same merchantReference is sent again, returns previous result.
   */
  router.post('/payment', async (req, res) => {
    const {
      checkRef,
      rvcRef,
      amount,
      cardToken,
      merchantReference,
      tenderMediaRef,
      description,
      employeeRef,
      orderTypeRef,
      cardLastFour
    } = req.body;

    // Validation
    const missingFields = [];
    if (!checkRef) missingFields.push('checkRef');
    if (!rvcRef) missingFields.push('rvcRef');
    if (!amount) missingFields.push('amount');
    if (!cardToken) missingFields.push('cardToken');
    if (!merchantReference) missingFields.push('merchantReference');
    if (!tenderMediaRef) missingFields.push('tenderMediaRef');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Amount validation
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number'
      });
    }

    // PCI Compliance: Reject raw card data
    if (req.body.cardNumber || req.body.cvv || req.body.expiryMonth || req.body.expiryYear) {
      logger.warn('PCI violation attempt - raw card data in request', {
        merchantReference,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        error: 'Raw card data not allowed. Use cardToken only (PCI compliance).'
      });
    }

    try {
      logger.info('Processing proxy payment request', {
        checkRef,
        rvcRef,
        amount: parsedAmount,
        merchantReference,
        tenderMediaRef
      });

      const result = await orchestrator.processPayment({
        checkRef,
        rvcRef,
        amount: parsedAmount,
        cardToken,
        merchantReference,
        tenderMediaRef,
        description,
        employeeRef: employeeRef ? parseInt(employeeRef, 10) : null,
        orderTypeRef: orderTypeRef ? parseInt(orderTypeRef, 10) : null,
        cardLastFour: cardLastFour || null
      });

      // Handle different result types
      if (result.needsReconciliation) {
        // Split-brain scenario - gateway approved but tender failed
        logger.error('Payment needs reconciliation', {
          intentId: result.intentId,
          authId: result.authId,
          merchantReference
        });

        return res.status(500).json({
          success: false,
          needsReconciliation: true,
          gatewayApproved: result.gatewayApproved,
          authId: result.authId,
          transactionId: result.transactionId,
          intentId: result.intentId,
          error: result.error
        });
      }

      if (result.inProgress) {
        // Another request for same merchantReference is still processing
        return res.status(409).json({
          success: false,
          inProgress: true,
          intentId: result.intentId,
          state: result.state,
          error: 'Payment is currently being processed'
        });
      }

      // Standard response
      const statusCode = result.success ? 200 : (result.canRetry ? 503 : 400);

      res.status(statusCode).json({
        success: result.success,
        intentId: result.intentId,
        authId: result.authId || null,
        transactionId: result.transactionId || null,
        tenderRef: result.tenderRef || null,
        canRetry: result.canRetry || false,
        idempotent: result.idempotent || false,
        recoveredFromTimeout: result.recoveredFromTimeout || false,
        error: result.error || null
      });

    } catch (error) {
      logger.error('Proxy payment failed', {
        error: error.message,
        checkRef,
        merchantReference,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /proxy/payment/:intentId
   *
   * Query payment status by intent ID
   */
  router.get('/payment/:intentId', async (req, res) => {
    const { intentId } = req.params;

    try {
      const intent = await intentManager.getIntent(intentId);

      if (!intent) {
        return res.status(404).json({
          success: false,
          error: 'Payment intent not found'
        });
      }

      res.json({
        intentId: intent.intent_id,
        state: intent.state,
        amount: parseFloat(intent.amount),
        checkRef: intent.master_check_ref,
        rvcRef: intent.rvc_ref,
        merchantReference: intent.merchant_reference,
        authId: intent.auth_id,
        transactionId: intent.gateway_reference,
        tenderRef: intent.tender_ref,
        lastError: intent.last_error,
        createdAt: intent.created_at,
        updatedAt: intent.updated_at
      });

    } catch (error) {
      logger.error('Status query failed', { error: error.message, intentId });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /proxy/payment/by-reference/:merchantReference
   *
   * Query payment status by merchant reference (Ethor's reference)
   */
  router.get('/payment/by-reference/:merchantReference', async (req, res) => {
    const { merchantReference } = req.params;

    try {
      const intent = await orchestrator.findByMerchantRef(merchantReference);

      if (!intent) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found for this merchant reference'
        });
      }

      res.json({
        intentId: intent.intent_id,
        state: intent.state,
        amount: parseFloat(intent.amount),
        checkRef: intent.master_check_ref,
        rvcRef: intent.rvc_ref,
        merchantReference: intent.merchant_reference,
        authId: intent.auth_id,
        transactionId: intent.gateway_reference,
        tenderRef: intent.tender_ref,
        lastError: intent.last_error,
        createdAt: intent.created_at,
        updatedAt: intent.updated_at
      });

    } catch (error) {
      logger.error('Reference query failed', { error: error.message, merchantReference });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /proxy/reconcile/:intentId
   *
   * Mark a payment as reconciled (ops endpoint)
   * Used when gateway approved but tender failed and ops manually verified
   */
  router.post('/reconcile/:intentId', async (req, res) => {
    const { intentId } = req.params;
    const { resolution } = req.body;

    if (!resolution || !['tender_posted', 'voided'].includes(resolution)) {
      return res.status(400).json({
        success: false,
        error: 'Resolution must be "tender_posted" or "voided"'
      });
    }

    try {
      const result = await orchestrator.markReconciled(intentId, resolution);

      logger.info('Payment reconciled via API', {
        intentId,
        resolution
      });

      res.json(result);

    } catch (error) {
      logger.error('Reconciliation failed', {
        error: error.message,
        intentId,
        resolution
      });

      res.status(error.message.includes('not found') ? 404 : 400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /proxy/reconciliation-queue
   *
   * List all payments that need reconciliation
   */
  router.get('/reconciliation-queue', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    try {
      const intents = await intentManager.getIntentsNeedingReconciliation(limit);

      res.json({
        success: true,
        count: intents.length,
        intents: intents.map(intent => ({
          intentId: intent.intent_id,
          state: intent.state,
          amount: parseFloat(intent.amount),
          checkRef: intent.master_check_ref,
          merchantReference: intent.merchant_reference,
          authId: intent.auth_id,
          transactionId: intent.gateway_reference,
          lastError: intent.last_error,
          createdAt: intent.created_at,
          updatedAt: intent.updated_at
        }))
      });

    } catch (error) {
      logger.error('Failed to get reconciliation queue', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createProxyRouter;
