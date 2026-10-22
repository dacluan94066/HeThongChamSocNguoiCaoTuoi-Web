const { poolPromise, sql } = require('../config/db');
const { ok, fail } = require('../utils/response');
const { validateElderlyProfile } = require('../utils/elderlyProfileValidation');

// Complete only the authenticated elderly account, never a client-supplied ID.
const createMine = async (req, res, next) => {
  if (req.user?.tenVaiTro !== 'NguoiCaoTuoi') {
    return fail(res, 'Chỉ người cao tuổi được bổ sung hồ sơ của mình', 'FORBIDDEN', 403);
  }
  const allowed = ['hoTen', 'ngaySinh', 'gioiTinh', 'cccd', 'soDienThoai', 'diaChi', 'nhomMau', 'benhNen', 'diUng'];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some(key => !allowed.includes(key))) {
    return fail(res, 'Chỉ được bổ sung thông tin hồ sơ của chính mình', 'INVALID_FIELDS', 422);
  }
  const validation = validateElderlyProfile(req.body);
  if (validation.error) return fail(res, validation.error.message, `INVALID_${validation.error.field.toUpperCase()}`, 422);
  const profile = validation.value;
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const account = (await new sql.Request(transaction).input('userId', sql.Int, req.user.userId)
      .query(`SELECT nd.Email AS email,nd.SoDienThoai AS phone,nd.TrangThai AS status,vt.TenVaiTro AS role
        FROM NguoiDung nd WITH(UPDLOCK,HOLDLOCK) JOIN VaiTro vt ON vt.VaiTroID=nd.VaiTroID
        WHERE nd.UserID=@userId`)).recordset[0];
    if (!account || account.role !== 'NguoiCaoTuoi' || account.status !== 'HoatDong') {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Tài khoản không còn hợp lệ, vui lòng đăng nhập lại', 'INVALID_TOKEN', 401);
    }
    // Locking the account first serializes concurrent submissions from two devices.
    const existing = (await new sql.Request(transaction).input('userId', sql.Int, req.user.userId)
      .query(`SELECT NguoiCaoTuoiID AS id,UserID AS userId,HoTen AS hoTen,NgaySinh AS ngaySinh,
        GioiTinh AS gioiTinh,SoDienThoai AS soDienThoai,DiaChi AS diaChi,CCCD AS cccd,
        NhomMau AS nhomMau,BenhNen AS benhNen,DiUng AS diUng,TrangThai AS trangThai
        FROM HoSoNguoiCaoTuoi WITH(UPDLOCK,HOLDLOCK) WHERE UserID=@userId`)).recordset[0];
    if (existing) {
      await transaction.commit(); transaction = null;
      return ok(res, { ...existing, email: account.email }, 'Hồ sơ đã được bổ sung trước đó');
    }
    // If phone is omitted, preserve the account's login phone instead of clearing it.
    profile.soDienThoai = profile.soDienThoai || account.phone || null;
    if (profile.soDienThoai && !/^0\d{9}$/.test(profile.soDienThoai)) {
      await transaction.rollback(); transaction = null;
      return fail(res, 'Số điện thoại phải có 10 số và bắt đầu bằng 0', 'INVALID_SODIENTHOAI', 422);
    }
    const duplicate = (await new sql.Request(transaction)
      .input('userId', sql.Int, req.user.userId).input('phone', sql.VarChar(15), profile.soDienThoai)
      .input('cccd', sql.VarChar(20), profile.cccd)
      .query(`SELECT 'PHONE_TAKEN' AS reason WHERE @phone IS NOT NULL AND (
        EXISTS(SELECT 1 FROM NguoiDung WITH(UPDLOCK,HOLDLOCK)
          WHERE UserID<>@userId AND (SoDienThoai=@phone OR TenDangNhap=@phone))
        OR EXISTS(SELECT 1 FROM NguoiChamSoc WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@phone)
        OR EXISTS(SELECT 1 FROM HoSoNguoiCaoTuoi WITH(UPDLOCK,HOLDLOCK) WHERE SoDienThoai=@phone))
        UNION ALL SELECT 'CCCD_TAKEN' AS reason WHERE @cccd IS NOT NULL AND EXISTS(
          SELECT 1 FROM HoSoNguoiCaoTuoi WITH(UPDLOCK,HOLDLOCK) WHERE CCCD=@cccd)`)).recordset[0];
    if (duplicate) {
      await transaction.rollback(); transaction = null;
      return fail(res, `${duplicate.reason === 'PHONE_TAKEN' ? 'Số điện thoại' : 'CCCD'} đã được sử dụng. Vui lòng kiểm tra hoặc liên hệ quản trị viên, không tạo lại hồ sơ.`, duplicate.reason, 409);
    }
    const inserted = await new sql.Request(transaction)
      .input('userId', sql.Int, req.user.userId).input('hoTen', sql.NVarChar(100), profile.hoTen)
      .input('ngaySinh', sql.Date, profile.ngaySinh).input('gioiTinh', sql.NVarChar(10), profile.gioiTinh)
      .input('cccd', sql.VarChar(20), profile.cccd).input('phone', sql.VarChar(15), profile.soDienThoai)
      .input('diaChi', sql.NVarChar(255), profile.diaChi).input('nhomMau', sql.VarChar(5), profile.nhomMau)
      .input('benhNen', sql.NVarChar(500), profile.benhNen).input('diUng', sql.NVarChar(300), profile.diUng)
      .query(`INSERT INTO HoSoNguoiCaoTuoi(UserID,HoTen,NgaySinh,GioiTinh,CCCD,SoDienThoai,DiaChi,NhomMau,BenhNen,DiUng,TrangThai,NguoiTaoID)
        OUTPUT INSERTED.NguoiCaoTuoiID AS id
        VALUES(@userId,@hoTen,@ngaySinh,@gioiTinh,@cccd,@phone,@diaChi,@nhomMau,@benhNen,@diUng,N'DangTheoDoi',@userId)`);
    await new sql.Request(transaction).input('userId', sql.Int, req.user.userId)
      .input('hoTen', sql.NVarChar(100), profile.hoTen).input('phone', sql.VarChar(15), profile.soDienThoai)
      .query('UPDATE NguoiDung SET HoTen=@hoTen,SoDienThoai=@phone WHERE UserID=@userId');
    await transaction.commit(); transaction = null;
    return ok(res, { id: inserted.recordset[0].id, userId: req.user.userId, ...profile,
      email: account.email, trangThai: 'DangTheoDoi' }, 'Đã tạo hồ sơ người cao tuổi', 201);
  } catch (error) {
    if (transaction) { try { await transaction.rollback(); } catch (_) { /* Already rolled back. */ } }
    if ([2601, 2627].includes(error.number)) {
      return fail(res, 'Thông tin hồ sơ hoặc số điện thoại đã được sử dụng. Vui lòng kiểm tra hoặc liên hệ quản trị viên.', 'PROFILE_CONFLICT', 409);
    }
    next(error);
  }
};

module.exports = { createMine };
