const cors = require('cors');
const { fail } = require('../utils/response');

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true; // Native mobile and server requests do not use browser CORS.
  let url;
  try { url = new URL(origin); } catch (_) { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return false;
  const configured = (env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  return ['development', 'test'].includes(env.NODE_ENV || 'development') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function createCorsMiddleware(env = process.env) {
  const middleware = cors({
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  return (req, res, next) => {
    if (!isAllowedOrigin(req.get('Origin'), env)) {
      return fail(res, 'Origin không được phép truy cập API.', 'CORS_ORIGIN_DENIED', 403);
    }
    return middleware(req, res, next);
  };
}
module.exports = { createCorsMiddleware, isAllowedOrigin };
