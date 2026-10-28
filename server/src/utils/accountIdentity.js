class AccountIdentityError extends Error {
  constructor(code) {
    super(code === 'USERNAME_TAKEN' ? 'Tên đăng nhập đã được sử dụng'
      : code === 'PHONE_TAKEN' ? 'Số điện thoại tài khoản đã được sử dụng'
        : 'Thông tin tài khoản đang được cập nhật. Vui lòng thử lại.');
    this.errorCode = code; this.statusCode = 409;
  }
}

// All account identifier writers take this transaction-owned lock BEFORE row locks.
// This also protects installations without a unique phone index. Profile contact
// details are separate and do not acquire or change login identifiers here.
async function lockAccountIdentifiers(transaction, sql) {
  try {
    await new sql.Request(transaction).query(`DECLARE @identityLock int;
      EXEC @identityLock=sys.sp_getapplock @Resource=N'CareSenior.AccountIdentifiers',
        @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
      IF @identityLock<0 THROW 51015, 'ACCOUNT_IDENTITY_BUSY', 1;`);
  } catch (error) {
    if (error.number === 51015) throw new AccountIdentityError('ACCOUNT_IDENTITY_BUSY');
    throw error;
  }
}

async function checkAccountIdentifiers(transaction, sql, { userId = null, phone = null, username = null } = {}) {
  const result = await new sql.Request(transaction)
    .input('identityUserId', sql.Int, userId)
    .input('identityPhone', sql.VarChar(15), typeof phone === 'string' ? phone.trim() || null : null)
    .input('identityUsername', sql.NVarChar(50), username)
    .query(`SELECT TOP(1) CASE
        WHEN @identityUsername IS NOT NULL AND (TenDangNhap=@identityUsername OR LTRIM(RTRIM(SoDienThoai))=@identityUsername)
          THEN 'USERNAME_TAKEN' ELSE 'PHONE_TAKEN' END AS identityConflict
      FROM NguoiDung WITH(UPDLOCK,HOLDLOCK)
      WHERE (@identityUserId IS NULL OR UserID<>@identityUserId) AND (
        (@identityPhone IS NOT NULL AND (LTRIM(RTRIM(SoDienThoai))=@identityPhone OR TenDangNhap=@identityPhone))
        OR (@identityUsername IS NOT NULL AND (TenDangNhap=@identityUsername OR LTRIM(RTRIM(SoDienThoai))=@identityUsername)))`);
  if (result.recordset[0]?.identityConflict) throw new AccountIdentityError(result.recordset[0].identityConflict);
}

async function reserveAccountIdentifiers(transaction, sql, identifiers) {
  await lockAccountIdentifiers(transaction, sql);
  await checkAccountIdentifiers(transaction, sql, identifiers);
}

module.exports = { AccountIdentityError, lockAccountIdentifiers, checkAccountIdentifiers, reserveAccountIdentifiers };
