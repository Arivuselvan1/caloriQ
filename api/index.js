const requestHandler = require('../server.js');

module.exports = (req, res) => {
  const originalUrl = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (originalUrl && (req.url === '/api/index.js' || req.url.startsWith('/api/index.js'))) {
    req.url = originalUrl;
  }
  return requestHandler(req, res);
};

