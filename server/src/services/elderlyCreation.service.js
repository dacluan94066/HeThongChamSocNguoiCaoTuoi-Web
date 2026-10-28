const { AccountIdentityError, reserveAccountIdentifiers } = require('../utils/accountIdentity');
const bcrypt = require('bcryptjs');
const { validateElderlyProfile } = require('../utils/elderlyProfileValidation');
const { validateElderlyAccount } = require('../utils/elderlyAccountValidation');

class ElderlyCreationError extends Error {
  constructor(message, errorCode, statusCode) {
    super(message); this.errorCode = errorCode; this.statusCode = statusCode;
  }
}

// Shared by user-management creation and the backwards-compatible elderly API.
// Database dependencies are injected; neither entry point duplicates the transaction.
async function createElderlyProfile(body, creatorId, { poolPromise, sql }) {
  const validation = validateElderlyProfile(body);
  if (validation.error) throw new ElderlyCreationError(validation.error.message,
    `INVALID_${validation.error.field.toUpperCase()}`, 422);
  const accountValidation = body.taiKhoan === undefined ? null : validateElderlyAccount(body.taiKhoan);
  if (accountValidation?.error) throw new ElderlyCreationError(accountValidation.error.message, accountValidation.error.code, 422);
  const profile = validation.value, account = accountValidation?.value;
  let transaction;
  try {
    const pool = await poolPromise;
    let userId = null;
    if (account) {
      const hash = await bcrypt.hash(account.matKhau, 10);
      transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      await reserveAccountIdentifiers(transaction, sql, { phone: profile.soDienThoai, username: account.tenDangNhap });
      const duplicates = await new sql.Request(transaction)
        .input('username', sql.VarChar(50), account.tenDangNhap)
        .input('email', sql.VarChar(100), account.email)
        .input('phone', sql.VarChar(15), profile.soDienThoai)
        .query(`SELECT TOP(1)
          CASE WHEN TenDangNhap=@username OR LTRIM(RTRIM(SoDienThoai))=@username THEN 'USERNAME_TAKEN'
            WHEN LOWER(LTRIM(RTRIM(Email)))=@email OR LOWER(TenDangNhap)=@email THEN 'EMAIL_TAKEN'
            ELSE 'PHONE_TAKEN' END AS reason
          FROM NguoiDung WITH(UPDLOCK,HOLDLOCK)
          WHERE TenDangNhap=@username OR LTRIM(RTRIM(SoDienThoai))=@username
            OR LOWER(LTRIM(RTRIM(Email)))=@email OR LOWER(TenDangNhap)=@email
            OR (@phone IS NOT NULL AND (LTRIM(RTRIM(SoDienThoai))=@phone OR TenDangNhap=@phone))`);
      let duplicate = duplicates.recordset[0]?.reason;
      if (!duplicate) {
        const reserved = await new sql.Request(transaction)
          .input('email', sql.VarChar(100), account.email)
          .input('phone', sql.VarChar(15), profile.soDienThoai)
          .query(`SELECT 'EMAIL_TAKEN' AS reason WHERE EXISTS(
              SELECT 1 FROM NguoiChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE LOWER(LTRIM(RTRIM(Email)))=@email)
            UNION ALL
            SELECT 'PHONE_TAKEN' AS reason WHERE @phone IS NOT NULL AND (
              EXISTS(SELECT 1 FROM NguoiChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@phone)
              OR EXISTS(SELECT 1 FROM HoSoNguoiCaoTuoi WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@phone))`);
        duplicate = reserved.recordset[0]?.reason;
      }
      if (duplicate) {
        const messages = { USERNAME_TAKEN: 'Tên đăng nhập đã được sử dụng',
          EMAIL_TAKEN: 'Email đã được sử dụng', PHONE_TAKEN: 'Số điện thoại đã được sử dụng' };
        throw new ElderlyCreationError(messages[duplicate], duplicate, 409);
      }
      const role = (await new sql.Request(transaction)
        .query("SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=N'NguoiCaoTuoi'")).recordset[0];
      if (!role) throw new ElderlyCreationError('Chưa cấu hình vai trò Người cao tuổi', 'ROLE_NOT_FOUND', 500);
      const created = await new sql.Request(transaction)
        .input('username', sql.VarChar(50), account.tenDangNhap)
        .input('hash', sql.VarChar(255), hash)
        .input('hoTen', sql.NVarChar(100), profile.hoTen)
        .input('email', sql.VarChar(100), account.email)
        .input('phone', sql.VarChar(15), profile.soDienThoai)
        .input('roleId', sql.Int, role.id)
        .query(`INSERT INTO NguoiDung(TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
          OUTPUT INSERTED.UserID AS userId
          VALUES(@username,@hash,@hoTen,@email,@phone,@roleId,N'HoatDong')`);
      userId = created.recordset[0].userId;
    }
    const created = await (transaction ? new sql.Request(transaction) : pool.request())
      .input('userId', sql.Int, userId)
      .input('hoTen', sql.NVarChar, profile.hoTen)
      .input('ngaySinh', sql.Date, profile.ngaySinh)
      .input('gioiTinh', sql.NVarChar, profile.gioiTinh)
      .input('cccd', sql.VarChar, profile.cccd)
      .input('diaChi', sql.NVarChar, profile.diaChi)
      .input('soDienThoai', sql.VarChar, profile.soDienThoai)
      .input('nhomMau', sql.VarChar, profile.nhomMau)
      .input('benhNen', sql.NVarChar, profile.benhNen || null)
      .input('diUng', sql.NVarChar, profile.diUng || null)
      .input('nguoiTaoId', sql.Int, creatorId)
      .query(`INSERT INTO HoSoNguoiCaoTuoi
        (UserID,HoTen,NgaySinh,GioiTinh,CCCD,DiaChi,SoDienThoai,NhomMau,BenhNen,DiUng,TrangThai,NguoiTaoID,NgayTao)
        OUTPUT INSERTED.NguoiCaoTuoiID AS id
        VALUES(@userId,@hoTen,@ngaySinh,@gioiTinh,@cccd,@diaChi,@soDienThoai,@nhomMau,@benhNen,@diUng,
          N'DangTheoDoi',@nguoiTaoId,SYSDATETIME())`);
    if (transaction) { await transaction.commit(); transaction = null; }
    return { id: created.recordset[0].id, userId, coTaiKhoanMobile: Boolean(userId),
      ...(account ? { tenDangNhap: account.tenDangNhap } : {}) };
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* SQL already rolled back. */ } }
    if ([2601, 2627].includes(error.number)) {
      if (/UX_HoSoNCT_CCCD/i.test(error.message || '')) {
        throw new ElderlyCreationError('CCCD đã thuộc một hồ sơ người cao tuổi khác', 'CCCD_TAKEN', 409);
      }
      throw new ElderlyCreationError('Tên đăng nhập, email hoặc số điện thoại đã được sử dụng', 'DUPLICATE_ACCOUNT', 409);
    }
    if (error instanceof AccountIdentityError) throw new ElderlyCreationError(error.message, error.errorCode, error.statusCode);
    throw error;
  }
}

module.exports = { createElderlyProfile, ElderlyCreationError };
