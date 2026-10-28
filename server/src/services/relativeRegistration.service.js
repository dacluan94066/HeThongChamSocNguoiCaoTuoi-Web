const bcrypt = require('bcryptjs');
const { ok, fail } = require('../utils/response');
const { validateElderlyAccount } = require('../utils/elderlyAccountValidation');
const { AccountIdentityError, reserveAccountIdentifiers } = require('../utils/accountIdentity');

// Public registration creates an unlinked family account only. Admin consent/link
// management remains the sole way to grant access to any elderly person's data.
function createRelativeRegistration({ poolPromise, sql }) {
  return async (req, res, next) => {
    let transaction;
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['tenDangNhap', 'matKhau', 'hoTen', 'email', 'soDienThoai'].includes(key))) {
        return fail(res, 'Thông tin đăng ký Người thân không hợp lệ. Không được tự đặt vai trò hoặc liên kết hồ sơ.', 'INVALID_REGISTRATION_FIELDS', 422);
      }
      const validation = validateElderlyAccount({ tenDangNhap: body.tenDangNhap, email: body.email, matKhau: body.matKhau });
      if (validation.error) return fail(res, validation.error.message, validation.error.code, 422);
      const name = typeof body.hoTen === 'string' ? body.hoTen.trim() : '';
      if (!name || name.length > 100) return fail(res, 'Họ và tên là bắt buộc, tối đa 100 ký tự.', 'INVALID_NAME', 422);
      if (body.soDienThoai != null && typeof body.soDienThoai !== 'string') {
        return fail(res, 'Số điện thoại tài khoản không hợp lệ.', 'INVALID_PHONE', 422);
      }
      const phone = body.soDienThoai?.trim() || null;
      if (phone && !/^0\d{9}$/.test(phone)) return fail(res, 'Số điện thoại phải có 10 chữ số và bắt đầu bằng 0.', 'INVALID_PHONE', 422);
      const account = validation.value;
      const hash = await bcrypt.hash(account.matKhau, 10);
      const pool = await poolPromise;
      transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      await reserveAccountIdentifiers(transaction, sql, { username: account.tenDangNhap, phone });
      const duplicate = await new sql.Request(transaction).input('email', sql.VarChar(100), account.email)
        .query('SELECT UserID FROM NguoiDung WITH(UPDLOCK,HOLDLOCK) WHERE LOWER(LTRIM(RTRIM(Email)))=@email');
      if (duplicate.recordset.length) {
        await transaction.rollback(); transaction = null;
        return fail(res, 'Email đã được sử dụng', 'EMAIL_TAKEN', 409);
      }
      const role = await new sql.Request(transaction)
        .query("SELECT VaiTroID AS id FROM VaiTro WHERE TenVaiTro=N'NguoiThan'");
      if (!role.recordset.length) {
        await transaction.rollback(); transaction = null;
        return fail(res, 'Đăng ký Người thân chưa sẵn sàng. Vui lòng liên hệ quản trị viên.', 'RELATIVE_ROLE_UNAVAILABLE', 503);
      }
      const created = await new sql.Request(transaction)
        .input('username', sql.VarChar(50), account.tenDangNhap).input('hash', sql.VarChar(255), hash)
        .input('name', sql.NVarChar(100), name).input('email', sql.VarChar(100), account.email)
        .input('phone', sql.VarChar(15), phone).input('roleId', sql.Int, role.recordset[0].id)
        .query(`INSERT INTO NguoiDung (TenDangNhap,MatKhauHash,HoTen,Email,SoDienThoai,VaiTroID,TrangThai)
          OUTPUT INSERTED.UserID AS userId
          VALUES (@username,@hash,@name,@email,@phone,@roleId,N'HoatDong')`);
      const userId = created.recordset[0].userId;
      await transaction.commit(); transaction = null;
      return ok(res, { userId, loaiTaiKhoan: 'NguoiThan', trangThai: 'HoatDong' },
        'Đăng ký Người thân thành công. Bạn có thể đăng nhập; chỉ được theo dõi NCT sau khi quản trị viên cấp liên kết có sự đồng ý chia sẻ.', 201);
    } catch (error) {
      if (transaction) { try { await transaction.rollback(); } catch (_) { /* Transaction already ended. */ } }
      if (error instanceof AccountIdentityError) return fail(res, error.message, error.errorCode, error.statusCode);
      if ([2601, 2627].includes(error.number)) return fail(res, 'Tên đăng nhập, email hoặc số điện thoại đã được sử dụng.', 'DUPLICATE_ACCOUNT', 409);
      next(error);
    }
  };
}

module.exports = { createRelativeRegistration };
