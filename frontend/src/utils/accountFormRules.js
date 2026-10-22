export const mobilePasswordRules = [
  { required: true, message: 'Vui lòng nhập mật khẩu' },
  { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
  { validator: (_, value) => !value || value.trim() && new TextEncoder().encode(value).length <= 72
    ? Promise.resolve() : Promise.reject(new Error('Mật khẩu không được chỉ gồm khoảng trắng hoặc vượt 72 byte UTF-8')) },
];

// Only fields belonging to the selected workflow are sent to the API.
// Password confirmation and hidden fields from another role never leave the UI.
export const buildUserCreatePayload = (values) => {
  const account = {
    hoTen: values.hoTen, vaiTro: values.vaiTro, username: values.username?.trim(),
    password: values.password, email: values.email?.trim().toLowerCase(), soDienThoai: values.soDienThoai,
  };
  if (values.vaiTro !== 'NGUOI_CAO_TUOI') return account;
  return { ...account, ngaySinh: values.ngaySinh?.format('YYYY-MM-DD'), gioiTinh: values.gioiTinh,
    cccd: values.cccd, diaChi: values.diaChi, nhomMau: values.nhomMau,
    benhNen: values.benhNen?.split(',').map(item => item.trim()).filter(Boolean) || [],
    diUng: values.diUng?.split(',').map(item => item.trim()).filter(Boolean) || [],
  };
};
