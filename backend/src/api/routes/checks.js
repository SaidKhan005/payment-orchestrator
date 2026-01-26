const express = require('express');
const logger = require('../../utils/logger');

function createChecksRouter(checkOps) {
  const router = express.Router();

  /**
   * GET /api/checks/:checkRef
   * Get check details from Simphony
   */
  router.get('/:checkRef', async (req, res) => {
    try {
      const { checkRef } = req.params;
      const { rvcRef } = req.query;

      if (!rvcRef) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required query parameter: rvcRef'
        });
      }

      logger.info('Received check detail request', {
        checkRef,
        rvcRef
      });

      const checkDetail = await checkOps.getCheckDetail(checkRef, parseInt(rvcRef));

      res.status(200).json({
        success: true,
        data: checkDetail
      });
    } catch (error) {
      logger.error('Failed to get check detail', {
        error: error.message,
        checkRef: req.params.checkRef
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createChecksRouter;
