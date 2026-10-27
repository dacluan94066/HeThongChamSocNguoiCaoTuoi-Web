const bcrypt = require('bcryptjs');
const { createGoogleWebChallenges } = require('../services/googleWebChallenge.service');

function createGoogleWebController({ poolPromise, sql, verifyGoogleIdToken, createSession, env = process.env,
  challenges = createGoogleWebChallenges({ env }), verificationTimeoutMs = 15000 }) {
  const clientId = () => {
    const value = String(env.GOOGLE_WEB_CLIENT_ID || '').trim();
    if (!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value)) throw Object.assign(Error('Web chưa được cấu hình đăng nhập Google. Bạn vẫn có thể đăng nhập bằng mật khẩu.'), { code: 'GOOGLE_AUTH_NOT_CONFIGURED', status: 503 });
    return value;
  };
  const ok = (res, data) => res.json({ success: true, data });
  const fail = (res, error) => {
    const expected = /^(GOOGLE_|INVALID_GOOGLE)/.test(error.code || '') && (error.status || error.statusCode);
    return res.status(expected ? error.status || error.statusCode : 503).json({ success: false,
      errorCode: expected ? error.code : 'GOOGLE_AUTH_UNAVAILABLE',
      message: expected ? error.message : 'Chưa xử lý được xác thực Google. Vui lòng thử lại sau.' });
  };
  const wrap = handler => async (req, res) => { try { return await handler(req, res); } catch (error) { return fail(res, error); } };
  const error = (code, message, status = 400) => Object.assign(Error(message), { code, status });
  const verify = async (token, nonce) => {
    let timer;
    try {
      return await Promise.race([verifyGoogleIdToken(token, { nonce }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(error('GOOGLE_VERIFICATION_TIMEOUT', 'Xác minh Google quá thời gian chờ. Bạn có thể đăng nhập bằng mật khẩu hoặc thử lại sau.', 503)), verificationTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  const nct = req => { if (req.user?.tenVaiTro !== 'NguoiCaoTuoi') throw error('GOOGLE_ROLE_DENIED', 'Google Web chỉ dành cho Người cao tuổi.', 403); return req.user.userId; };
  const columns = `nd.UserID AS userId,nd.TenDangNhap AS tenDangNhap,nd.HoTen AS hoTen,nd.Email AS email,
    nd.SoDienThoai AS soDienThoai,nd.VaiTroID AS vaiTroId,nd.TrangThai AS trangThai,
    nd.GoogleSubject AS googleSubject,nd.MatKhauHash AS passwordHash,vt.TenVaiTro AS tenVaiTro`;
  const account = async (pool, userId) => (await pool.request().input('userId', sql.Int, userId).query(`
    SELECT ${columns} FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID WHERE nd.UserID=@userId`)).recordset[0];
  const available = row => {
    if (!row || row.trangThai !== 'HoatDong') throw error('GOOGLE_ACCOUNT_UNAVAILABLE', 'Tài khoản không còn hoạt động. Vui lòng liên hệ quản trị viên.', 403);
    if (row.tenVaiTro !== 'NguoiCaoTuoi') throw error('GOOGLE_ROLE_DENIED', 'Google Web chỉ dành cho Người cao tuổi.', 403);
  };
  const validBody = (req, fields) => {
    if (Object.keys(req.body || {}).some(key => !fields.includes(key)) || typeof req.body.idToken !== 'string' || !req.body.idToken.trim()
      || req.body.idToken.length > 10000 || typeof req.body.challengeId !== 'string' || !/^[a-zA-Z0-9_-]{32}$/.test(req.body.challengeId)) {
      throw error('INVALID_GOOGLE_REQUEST', 'Thông tin phiên Google không hợp lệ.');
    }
  };
  const issue = purpose => wrap(async (req, res) => {
    const configuredId = clientId(), userId = purpose === 'link' ? nct(req) : null;
    if (Object.keys(req.body).length) throw error('INVALID_GOOGLE_REQUEST', 'Không truyền tài khoản hoặc hồ sơ vào yêu cầu phiên Google.');
    return ok(res, { ...challenges.issue(req, res, purpose, userId), clientId: configuredId });
  });
  return {
    guard: challenges.guard,
    config: wrap(async (_req, res) => ok(res, { clientId: clientId() })),
    loginChallenge: issue('login'), linkChallenge: issue('link'),
    status: wrap(async (req, res) => {
      const userId = nct(req), row = await account(await poolPromise, userId); available(row);
      return ok(res, { linked: Boolean(row.googleSubject) });
    }),
    login: wrap(async (req, res) => {
      clientId(); validBody(req, ['idToken', 'challengeId']);
      const challenge = challenges.consume(req, 'login');
      const identity = await verify(req.body.idToken, challenge.nonce);
      const pool = await poolPromise;
      // Email is never a login key or a link proof. A changed Google email must
      // not redirect a subject to a different CareSenior account.
      const rows = (await pool.request().input('googleSubject', sql.VarChar(255), identity.subject).query(`
        SELECT ${columns} FROM NguoiDung nd JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID WHERE nd.GoogleSubject=@googleSubject`)).recordset;
      if (!rows.length) throw error('GOOGLE_LINK_REQUIRED', 'Google chưa liên kết với CareSenior. Hãy đăng nhập bằng mật khẩu, mở Hồ sơ → Liên kết Google và xác minh mật khẩu để hoàn tất.', 409);
      if (rows.length !== 1) throw error('GOOGLE_ACCOUNT_CONFLICT', 'Danh tính Google đang có xung đột. Vui lòng liên hệ quản trị viên.', 409);
      // SQL Server collation may ignore case/trailing spaces. Never let that
      // turn a different opaque subject into an authenticated identity.
      if (rows[0].googleSubject !== identity.subject) throw error('GOOGLE_ACCOUNT_CONFLICT', 'Google không khớp chính xác với liên kết tài khoản.', 409);
      available(rows[0]); return ok(res, await createSession(pool, req, rows[0]));
    }),
    link: wrap(async (req, res) => {
      let transaction;
      try {
        clientId(); const userId = nct(req); validBody(req, ['idToken', 'challengeId', 'currentPassword']);
        // Reauthenticate with the same bcrypt semantics as password login.
        // Do not impose a new 72-byte rejection on existing Unicode passwords.
        if (typeof req.body.currentPassword !== 'string' || !req.body.currentPassword || Buffer.byteLength(req.body.currentPassword, 'utf8') > 10000) {
          throw error('GOOGLE_REAUTH_REQUIRED', 'Vui lòng nhập mật khẩu CareSenior hiện tại để xác minh.', 422);
        }
        const challenge = challenges.consume(req, 'link', userId), pool = await poolPromise, before = await account(pool, userId);
        available(before);
        if (!before.passwordHash || !await bcrypt.compare(req.body.currentPassword, before.passwordHash)) throw error('GOOGLE_REAUTH_FAILED', 'Mật khẩu CareSenior hiện tại không chính xác.', 403);
        const identity = await verify(req.body.idToken, challenge.nonce);
        transaction = new sql.Transaction(pool); await transaction.begin();
        const request = () => new sql.Request(transaction);
        const current = (await request().input('userId', sql.Int, userId).query(`SELECT ${columns} FROM NguoiDung nd WITH (UPDLOCK,HOLDLOCK)
          JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID WHERE nd.UserID=@userId`)).recordset[0];
        available(current);
        if (current.passwordHash !== before.passwordHash) throw error('GOOGLE_REAUTH_REQUIRED', 'Mật khẩu vừa thay đổi. Hãy xác minh lại.', 409);
        if (current.googleSubject && current.googleSubject !== identity.subject) throw error('GOOGLE_ALREADY_LINKED', 'Tài khoản đã liên kết một Google khác. Không tự thay thế liên kết.', 409);
        const owners = (await request().input('googleSubject', sql.VarChar(255), identity.subject).query(`
          SELECT UserID AS userId FROM NguoiDung WITH (UPDLOCK,HOLDLOCK) WHERE GoogleSubject=@googleSubject`)).recordset;
        if (owners.some(row => row.userId !== userId)) throw error('GOOGLE_SUBJECT_IN_USE', 'Google này đã liên kết với một tài khoản CareSenior khác.', 409);
        if (!current.googleSubject) {
          const result = await request().input('userId', sql.Int, userId).input('googleSubject', sql.VarChar(255), identity.subject).input('passwordHash', sql.VarChar(255), before.passwordHash).query(`
            UPDATE NguoiDung SET GoogleSubject=@googleSubject
            WHERE UserID=@userId AND GoogleSubject IS NULL AND MatKhauHash=@passwordHash AND TrangThai=N'HoatDong'`);
          if (result.rowsAffected?.[0] !== 1) throw error('GOOGLE_LINK_CONFLICT', 'Tài khoản vừa thay đổi. Hãy tải lại trạng thái liên kết.', 409);
        }
        await transaction.commit(); transaction = null;
        return ok(res, { linked: true });
      } catch (caught) {
        if (transaction) { try { await transaction.rollback(); } catch { /* Return a redacted error, never SQL parameters. */ } }
        if ([2601, 2627, 1205].includes(caught.number)) throw error('GOOGLE_LINK_CONFLICT', 'Liên kết vừa thay đổi ở phiên khác. Hãy tải lại trạng thái và thử lại.', 409);
        // A bad Google proof is not an expired CareSenior JWT. The auth
        // middleware alone returns 401 for the authenticated link endpoints.
        if (caught.statusCode === 401) throw error(caught.code, caught.message, 422);
        throw caught;
      }
    }),
  };
}
module.exports = { createGoogleWebController };
