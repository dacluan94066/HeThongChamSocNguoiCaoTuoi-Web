const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createGoogleWebController } = require('../../src/controllers/googleWeb.controller');
const { createGoogleWebChallenges } = require('../../src/services/googleWebChallenge.service');
const { createCorsMiddleware } = require('../../src/middlewares/cors.middleware');

// RAM only. Signature/audience/issuer validation is covered separately with
// real SDK + RSA keys; this fixture verifies HTTP, nonce, ownership and SQL flow.
async function createGoogleFixture(options = {}) {
  const hash = await bcrypt.hash('fixture-password', 4);
  const users = [70, 71].map(userId => ({ userId, tenDangNhap: `fixture.${userId}`, hoTen: `NCT fixture ${userId}`, email: `elder-${userId}@example.invalid`,
    tenVaiTro: 'NguoiCaoTuoi', vaiTroId: 3, trangThai: 'HoatDong', passwordHash: hash, googleSubject: userId === 70 && options.linked !== false ? 'fixture-google-70' : null }));
  const state = { users, sql: [], sessions: [], commits: 0, rollbacks: 0, verified: 0, writes: 0, zeroRows: false, databaseFailure: false };
  let queue = Promise.resolve();
  class Transaction {
    async begin() { const prior = queue; queue = new Promise(resolve => { this.release = resolve; }); await prior; this.snapshot = users.map(row => ({ ...row })); }
    async commit() { state.commits++; this.release(); }
    async rollback() { users.splice(0, users.length, ...this.snapshot); state.rollbacks++; this.release(); }
  }
  class Request {
    constructor(transaction) { this.transaction = transaction; this.inputs = {}; }
    input(name, _type, value) { this.inputs[name] = value; return this; }
    async query(query) {
      state.sql.push(query); const inputs = this.inputs;
      if (state.databaseFailure) throw Object.assign(Error('Sensitive driver information must not escape'), { statusCode: 500 });
      if (query.includes('UPDATE NguoiDung SET GoogleSubject')) {
        const user = users.find(row => row.userId === inputs.userId);
        if (state.zeroRows || !user || user.googleSubject != null || user.passwordHash !== inputs.passwordHash || user.trangThai !== 'HoatDong') return { rowsAffected: [0] };
        if (users.some(row => row.googleSubject === inputs.googleSubject)) throw Object.assign(Error('duplicate'), { number: 2601 });
        user.googleSubject = inputs.googleSubject; state.writes++; return { rowsAffected: [1] };
      }
      if (query.includes('UPDATE NguoiDung SET LanDangNhapCuoi') || query.includes('INSERT INTO NhatKyDangNhap')) return { recordset: [], rowsAffected: [1] };
      if (query.includes('WHERE nd.UserID=@userId')) return { recordset: users.filter(row => row.userId === inputs.userId).map(row => ({ ...row })) };
      if (query.includes('WHERE nd.GoogleSubject=@googleSubject')) return { recordset: users.filter(row => options.caseInsensitiveSubject
        ? row.googleSubject?.trim().toLowerCase() === inputs.googleSubject?.trim().toLowerCase() : row.googleSubject === inputs.googleSubject).map(row => ({ ...row })) };
      if (query.includes('WHERE GoogleSubject=@googleSubject')) return { recordset: users.filter(row => row.googleSubject === inputs.googleSubject).map(({ userId }) => ({ userId })) };
      throw Error('Unexpected query in isolated Google fixture');
    }
  }
  const pool = { request: () => new Request() }, sql = { Int: 'Int', VarChar: () => 'VarChar', NVarChar: () => 'NVarChar', Transaction, Request };
  const env = { NODE_ENV: 'test', GOOGLE_WEB_CLIENT_ID: options.configured === false ? '' : '123-fixture.apps.googleusercontent.com', CORS_ORIGINS: options.origin || '' };
  const controller = createGoogleWebController({ poolPromise: Promise.resolve(pool), sql, env,
    verificationTimeoutMs: options.verificationTimeoutMs,
    challenges: createGoogleWebChallenges({ env, now: options.now || Date.now }),
    async verifyGoogleIdToken(token, { nonce }) {
      state.verified++;
      let payload; try { payload = JSON.parse(Buffer.from(token.replace(/^synthetic:/, ''), 'base64url').toString()); } catch { /* Fail closed. */ }
      if (!token.startsWith('synthetic:') || !payload?.sub || payload.nonce !== nonce) throw Object.assign(Error('Google proof invalid'), { code: 'INVALID_GOOGLE_TOKEN', statusCode: 401 });
      state.afterVerify?.();
      if (state.deferVerification) await new Promise(resolve => { state.releaseVerification = resolve; });
      return { subject: payload.sub, email: payload.email || 'synthetic@example.invalid' };
    },
    async createSession(_pool, _req, user) {
      state.sessions.push(user.userId);
      return { token: options.browser ? (user.userId === 70 ? 'fixture-elder' : 'fixture-switched') : jwt.sign({ userId: user.userId, tenVaiTro: user.tenVaiTro, vaiTroId: user.vaiTroId, sessionVersion: 2 }, 'google-fixture-jwt-secret', { expiresIn: '5m' }),
        user: { userId: user.userId, tenVaiTro: user.tenVaiTro, hoTen: user.hoTen, tenDangNhap: user.tenDangNhap } };
    },
  });
  const auth = (req, res, next) => {
    let id;
    if (options.browser) id = req.headers.authorization === 'Bearer fixture-switched' ? 71 : req.headers.authorization === 'Bearer fixture-elder' ? 70 : null;
    else { try { id = jwt.verify(req.headers.authorization?.replace(/^Bearer /, ''), 'google-fixture-jwt-secret').userId; } catch { /* reject */ } }
    const user = users.find(row => row.userId === id);
    if (!user || user.trangThai !== 'HoatDong') return res.status(401).json({ success: false, errorCode: 'INVALID_TOKEN' });
    req.user = { userId: id, tenVaiTro: user.tenVaiTro }; next();
  };
  const router = express.Router(); router.use(controller.guard);
  router.get('/config', controller.config); router.post('/login/challenge', controller.loginChallenge); router.post('/login', controller.login);
  router.get('/status', auth, controller.status); router.post('/link/challenge', auth, controller.linkChallenge); router.post('/link', auth, controller.link);
  const app = express(); app.use(createCorsMiddleware(env)); app.use(express.json()); app.use(['/api/auth/google/web', '/fixture-api/auth/google/web'], router);
  app.use(require('../../src/middlewares/error.middleware'));
  const authToken = (userId = 70) => jwt.sign({ userId, sessionVersion: 2, tenVaiTro: users.find(row => row.userId === userId).tenVaiTro }, 'google-fixture-jwt-secret', { expiresIn: '5m' });
  const credential = (nonce, sub = 'fixture-google-70', email) => `synthetic:${Buffer.from(JSON.stringify({ nonce, sub, email })).toString('base64url')}`;
  return { app, state, controller, authToken, credential, pool, sql };
}
module.exports = { createGoogleFixture };
