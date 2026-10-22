// Match the phone rule already used for elderly profiles and registration.
const validatePhoneNumber = (value, { required = true, label = 'Số điện thoại' } = {}) => {
  if (value == null || typeof value === 'string' && !value.trim()) {
    return required ? `${label} là bắt buộc` : null;
  }
  if (typeof value !== 'string' || !/^0\d{9}$/.test(value.trim())) {
    return `${label} phải có 10 số và bắt đầu bằng 0`;
  }
  return null;
};

module.exports = { validatePhoneNumber };
