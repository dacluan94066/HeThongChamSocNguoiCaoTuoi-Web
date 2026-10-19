const bcrypt = require('bcryptjs');
const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');

const validId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
const validPassword = (value) => typeof value === 'string' && value.length >= 6 && value.length <= 128;

const createWebAccount = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'QuanTriVien') {
    return fail(res, 'Chỉ quản trị viên được tạo tài khoản Web', 'FORBIDDEN', 403);
  }
  const caregiverId = Number(req.params.id);
  const username = typeof req.body?.tenDangNhap === 'string' ? req.body.tenDangNhap.trim() : '';
  const password = req.body?.matKhauTam;
  if (!validId(caregiverId) || !/^[A-Za-z0-9._-]{3,50}$/.test(username)
    || !validPassword(password)) {
    return fail(res, 'Tên đăng nhập 3–50 ký tự và mật khẩu tạm 6–128 ký tự là bắt buộc', 'INVALID_ACCOUNT_INPUT', 400);
  }

  let transaction;
  try {
    const pool = await poolPromise;
    const hash = await bcrypt.hash(password, 10);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const caregiver = (await new sql.Request(transaction)
      .input('id', sql.Int, caregiverId)
      .query(`SELECT NguoiChamSocID AS id,UserID AS userId,HoTen AS name,
        SoDienThoai AS phone,Email AS email
        FROM NguoiChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE NguoiChamSocID=@id`)).recordset[0];
    if (!caregiver) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Không tìm thấy người chăm sóc', 'CAREGIVER_NOT_FOUND', 404);
    }
    if (caregiver.userId) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Người chăm sóc đã có tài khoản Web', 'ACCOUNT_EXISTS', 409);
    }
    const email = typeof caregiver.email === 'string' ? caregiver.email.trim().toLowerCase() : '';
    if (!email) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Hồ sơ phải có email trước khi tạo tài khoản Web', 'EMAIL_REQUIRED', 400);
    }
    const duplicate = (await new sql.Request(transaction)
      .input('username', sql.VarChar(50), username)
      .input('email', sql.VarChar(100), email)
      .input('phone', sql.VarChar(15), caregiver.phone)
      .query(`SELECT TOP(1)
        CASE WHEN TenDangNhap=@username THEN 'USERNAME_TAKEN'
          WHEN LOWER(Email)=@email THEN 'EMAIL_TAKEN' ELSE 'PHONE_TAKEN' END AS reason
        FROM NguoiDung WITH(UPDLOCK,HOLDLOCK)
        WHERE TenDangNhap=@username OR LOWER(Email)=@email OR SoDienThoai=@phone
        ORDER BY CASE WHEN TenDangNhap=@username THEN 0 WHEN LOWER(Email)=@email THEN 1 ELSE 2 END`)).recordset[0];
    if (duplicate) {
      await transaction.rollback(); transaction = null;
      const messages = { USERNAME_TAKEN: 'Tên đăng nhập đã được sử dụng',
        EMAIL_TAKEN: 'Email đã được sử dụng', PHONE_TAKEN: 'Số điện thoại đã được sử dụng' };
      return fail(res, messages[duplicate.reason], duplicate.reason, 409);
    }
    const role = (await new sql.Request(transaction)
      .query("SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=N'NguoiChamSoc'")).recordset[0];
    if (!role) throw new Error('Thiếu vai trò NguoiChamSoc');
    const created = await new sql.Request(transaction)
      .input('username', sql.VarChar(50), username)
      .input('hash', sql.VarChar(255), hash)
      .input('name', sql.NVarChar(100), caregiver.name)
      .input('email', sql.VarChar(100), email)
      .input('phone', sql.VarChar(15), caregiver.phone)
      .input('roleId', sql.Int, role.id)
      .query(`INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
        OUTPUT INSERTED.UserID AS id
        VALUES(@username,@hash,@name,@email,@phone,@roleId,N'HoatDong')`);
    const userId = created.recordset[0].id;
    const linked = await new sql.Request(transaction)
      .input('id', sql.Int, caregiverId)
      .input('userId', sql.Int, userId)
      .query(`UPDATE NguoiChamSoc SET UserID=@userId
        OUTPUT INSERTED.NguoiChamSocID AS id WHERE NguoiChamSocID=@id AND UserID IS NULL`);
    if (!linked.recordset.length) throw new Error('Không thể liên kết tài khoản với hồ sơ');
    await transaction.commit(); transaction = null;
    return ok(res, { caregiverId, userId, tenDangNhap: username }, 'Đã tạo tài khoản Web', 201);
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* SQL đã rollback */ } }
    if ([2601, 2627].includes(error.number)) {
      return fail(res, 'Tên đăng nhập hoặc email đã được sử dụng', 'DUPLICATE_ACCOUNT', 409);
    }
    return next(error);
  }
};

const resetWebPassword = async (req, res, next) => {
  if (req.user.tenVaiTro !== 'QuanTriVien') {
    return fail(res, 'Chỉ quản trị viên được đặt lại mật khẩu', 'FORBIDDEN', 403);
  }
  const caregiverId = Number(req.params.id);
  if (!validId(caregiverId) || !validPassword(req.body?.matKhauTam)) {
    return fail(res, 'Mật khẩu tạm phải có 6–128 ký tự', 'WEAK_PASSWORD', 400);
  }
  let transaction;
  try {
    const pool = await poolPromise;
    const hash = await bcrypt.hash(req.body.matKhauTam, 10);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const linked = (await new sql.Request(transaction)
      .input('id', sql.Int, caregiverId)
      .query(`SELECT ncs.UserID AS userId FROM NguoiChamSoc ncs WITH(UPDLOCK,HOLDLOCK)
        JOIN NguoiDung nd ON nd.UserID=ncs.UserID
        JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE ncs.NguoiChamSocID=@id AND vt.TenVaiTro=N'NguoiChamSoc'`)).recordset[0];
    if (!linked) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Người chăm sóc chưa có tài khoản Web', 'ACCOUNT_NOT_FOUND', 404);
    }
    await new sql.Request(transaction)
      .input('userId', sql.Int, linked.userId)
      .input('hash', sql.VarChar(255), hash)
      .query('UPDATE NguoiDung SET MatKhauHash=@hash WHERE UserID=@userId');
    await transaction.commit(); transaction = null;
    return ok(res, { caregiverId }, 'Đã đặt lại mật khẩu Web');
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* SQL đã rollback */ } }
    return next(error);
  }
};

module.exports = { createWebAccount, resetWebPassword };
