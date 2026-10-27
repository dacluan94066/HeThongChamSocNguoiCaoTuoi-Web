const crypto = require('node:crypto');
const { isAllowedGoogleOrigin } = require('../middlewares/cors.middleware');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const problem = (code, message, status = 400) => Object.assign(new Error(message), { code, status });

// Short-lived, single-use login/link challenges. No identities, Google tokens
// or passwords are retained. Restarting the process invalidates all attempts.
function createGoogleWebChallenges({ now = Date.now, env = process.env } = {}) {
  const challenges = new Map(), limits = new Map();
  const cookieName = env.NODE_ENV === 'production' ? '__Host-caresenior-google' : 'caresenior_google_browser';
  const cleanup = () => {
    for (const [id, row] of challenges) if (row.expiresAt <= now()) challenges.delete(id);
    for (const [key, row] of limits) if (row.until <= now()) limits.delete(key);
  };
  const cookie = req => {
    const part = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`));
    const value = part?.slice(cookieName.length + 1);
    return /^[a-zA-Z0-9_-]{43}$/.test(value || '') ? value : null;
  };
  const origin = req => {
    const value = req.get('Origin');
    if (!isAllowedGoogleOrigin(value, env)) {
      throw problem('GOOGLE_ORIGIN_DENIED', 'Nguồn yêu cầu Google không được phép.', 403);
    }
    return value;
  };
  const throttle = key => {
    cleanup(); const record = limits.get(key) || { count: 0, until: now() + 60000 };
    if (limits.size >= 10000 && !limits.has(key)) throw problem('GOOGLE_RATE_LIMIT', 'Vui lòng thử lại sau một phút.', 429);
    limits.set(key, record);
    if (++record.count > 10) throw problem('GOOGLE_RATE_LIMIT', 'Bạn thử Google quá nhanh. Vui lòng chờ một phút.', 429);
  };
  return {
    guard(req, res, next) {
      res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache');
      try {
        if (Object.keys(req.query || {}).length) throw problem('INVALID_GOOGLE_REQUEST', 'Không gửi dữ liệu xác thực qua URL.');
        if (req.method !== 'GET') {
          origin(req);
          if (!req.is('application/json') || !req.body || Array.isArray(req.body)) throw problem('INVALID_GOOGLE_REQUEST', 'Yêu cầu Google phải là JSON hợp lệ.');
        }
        next();
      } catch (error) { res.status(error.status || 400).json({ success: false, message: error.message, errorCode: error.code }); }
    },
    issue(req, res, purpose, userId = null) {
      const webOrigin = origin(req);
      throttle(`issue:${req.ip}`); if (userId) throttle(`account:${userId}`);
      if (challenges.size >= 4096) throw problem('GOOGLE_BUSY', 'Đăng nhập Google đang bận. Vui lòng thử lại sau.', 503);
      const browser = cookie(req) || crypto.randomBytes(32).toString('base64url');
      res.cookie(cookieName, browser, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 10 * 60000 });
      const id = crypto.randomBytes(24).toString('base64url'), nonce = crypto.randomBytes(32).toString('base64url');
      const expiresAt = now() + 5 * 60000;
      challenges.set(id, { browser: digest(browser), nonce, expiresAt, origin: webOrigin, purpose, userId });
      return { challengeId: id, nonce, expiresAt: new Date(expiresAt).toISOString() };
    },
    consume(req, purpose, userId = null) {
      const webOrigin = origin(req); throttle(`verify:${req.ip}`); if (userId) throttle(`verify-account:${userId}`);
      const id = req.body.challengeId, browser = cookie(req), record = challenges.get(id);
      if (!record || !browser || record.expiresAt <= now() || record.purpose !== purpose || record.userId !== userId
        || record.origin !== webOrigin || !same(record.browser, digest(browser))) {
        throw problem('GOOGLE_CHALLENGE_INVALID', 'Phiên Google đã hết hạn, bị dùng lại hoặc thiếu cookie. Hãy bắt đầu lại; Web và API cần cùng site.', 403);
      }
      // Delete synchronously, before any password/token verification awaits.
      challenges.delete(id); return record;
    },
  };
}
module.exports = { createGoogleWebChallenges };
