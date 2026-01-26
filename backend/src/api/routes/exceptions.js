const express = require('express');
const logger = require('../../utils/logger');

function createExceptionsRouter(intentManager) {
  const router = express.Router();

  /**
   * GET /api/exceptions
   * Get payment exceptions
   */
  router.get('/', async (req, res) => {
    try {
      const resolved = req.query.resolved === 'true';
      const limit = parseInt(req.query.limit) || 50;

      logger.info('Received exceptions request', {
        resolved,
        limit
      });

      const exceptions = await intentManager.getExceptions(resolved, limit);

      res.status(200).json({
        success: true,
        data: exceptions,
        count: exceptions.length
      });
    } catch (error) {
      logger.error('Failed to get exceptions', {
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

module.exports = createExceptionsRouter;
