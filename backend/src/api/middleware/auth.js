const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * API Key authentication middleware
 */
function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    logger.warn('Missing API key in request', {
      path: req.path,
      ip: req.ip
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required'
    });
  }

  if (apiKey !== config.security.apiKey) {
    logger.warn('Invalid API key in request', {
      path: req.path,
      ip: req.ip,
      providedKey: apiKey.substring(0, 5) + '...'
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }

  logger.debug('API key authenticated', {
    path: req.path
  });

  next();
}

module.exports = { apiKeyAuth };
