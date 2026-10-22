// Credentials are optional for profile-only creation, but complete when enabled.
// Role and profile links are always chosen by the server, never by this input.
function validateElderlyPassword(matKhau) {
  // bcrypt truncates beyond 72 bytes: reject instead of silently weakening it.
  return typeof matKhau !== 'string' || !matKhau.trim() || matKhau.length < 6
    || Buffer.byteLength(matKhau, 'utf8') > 72
    ? { code: 'INVALID_PASSWORD', message: 'Mật khẩu phải có ít nhất 6 ký tự và không quá 72 byte UTF-8' }
    : null;
}

function validateElderlyAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['tenDangNhap', 'email', 'matKhau'].includes(key))) {
    return { error: { code: 'INVALID_ACCOUNT_INPUT', message: 'Thông tin tài khoản Mobile không hợp lệ' } };
  }
  const tenDangNhap = typeof input.tenDangNhap === 'string' ? input.tenDangNhap.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const matKhau = input.matKhau;
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(tenDangNhap)) {
    return { error: { code: 'INVALID_USERNAME', message: 'Tên đăng nhập gồm 3–50 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang' } };
  }
  if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: { code: 'INVALID_EMAIL', message: 'Vui lòng nhập email hợp lệ, tối đa 100 ký tự, để khôi phục mật khẩu' } };
  }
  const passwordError = validateElderlyPassword(matKhau);
  if (passwordError) return { error: passwordError };
  return { value: { tenDangNhap, email, matKhau } };
}

module.exports = { validateElderlyAccount, validateElderlyPassword };
