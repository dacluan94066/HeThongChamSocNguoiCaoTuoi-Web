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
  const options = {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  };
  const middleware = cors(options);
  // Only this browser-bound flow needs cookies; existing API CORS is unchanged.
  const google = cors({ ...options, credentials: true });
  return (req, res, next) => {
    const googlePath = req.path === '/api/auth/google/web' || req.path?.startsWith('/api/auth/google/web/');
    const origin = req.get('Origin');
    if (googlePath ? origin && !isAllowedGoogleOrigin(origin, env) : !isAllowedOrigin(origin, env)) {
      return fail(res, 'Origin không được phép truy cập API.', 'CORS_ORIGIN_DENIED', 403);
    }
    return googlePath ? google(req, res, next) : middleware(req, res, next);
  };
}
function isAllowedGoogleOrigin(origin, env = process.env) {
  if (!origin) return false;
  if (env.NODE_ENV === 'production' && !origin.startsWith('https://')) return false;
  return env.GOOGLE_WEB_ORIGINS?.trim()
    ? isAllowedOrigin(origin, { ...env, NODE_ENV: 'production', CORS_ORIGINS: env.GOOGLE_WEB_ORIGINS })
    : isAllowedOrigin(origin, env);
}
module.exports = { createCorsMiddleware, isAllowedOrigin, isAllowedGoogleOrigin };
