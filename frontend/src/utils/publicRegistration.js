export const PUBLIC_REGISTRATION_ROLES = Object.freeze([
  { value: 'NguoiCaoTuoi', label: 'Người cao tuổi', detail: 'Theo dõi sức khỏe của tôi',
    note: 'Dùng cùng tài khoản và hồ sơ trên Web và Mobile.',
    success: 'Bạn có thể đăng nhập trên Web hoặc Mobile bằng cùng tài khoản. Hồ sơ cá nhân đã được tạo cùng tài khoản.' },
  { value: 'NguoiChamSoc', label: 'Người chăm sóc', detail: 'Chăm sóc NCT được phân công',
    note: 'Quản trị viên sẽ duyệt tài khoản và phân công NCT. Đăng ký không tự cấp quyền xem hồ sơ.',
    success: 'Tài khoản đang chờ quản trị viên kiểm tra và duyệt. Sau khi được duyệt và phân công NCT, bạn có thể sử dụng Web.' },
  { value: 'NguoiThan', label: 'Người thân', detail: 'Theo dõi người thân trong gia đình',
    note: 'Bạn chỉ xem được NCT khi Admin cấp liên kết và ghi nhận sự đồng ý chia sẻ. Không tự liên kết bằng email hoặc số điện thoại.',
    success: 'Bạn có thể đăng nhập Web. Để xem thông tin NCT, hãy liên hệ quản trị viên cấp liên kết theo sự đồng ý chia sẻ.' },
]);

export function buildPublicRegistration(values) {
  const role = PUBLIC_REGISTRATION_ROLES.find(item => item.value === values.loaiTaiKhoan);
  if (!role) throw new Error('Vui lòng chọn một trong ba loại tài khoản được phép đăng ký.');
  const body = { hoTen: values.hoTen?.trim(), tenDangNhap: values.tenDangNhap?.trim(),
    email: values.email?.trim().toLowerCase(), matKhau: values.matKhau, soDienThoai: values.soDienThoai?.trim() || '' };
  if (role.value === 'NguoiCaoTuoi') {
    body.loaiTaiKhoan = role.value;
    body.ngaySinh = values.ngaySinh?.format('YYYY-MM-DD'); body.gioiTinh = values.gioiTinh;
  }
  return { role, body, endpoint: ({ NguoiCaoTuoi: '/auth/register', NguoiChamSoc: '/auth/register-caregiver', NguoiThan: '/auth/register-relative' })[role.value] };
}

export function createPublicRegistrationApi(client) {
  return async values => {
    const request = buildPublicRegistration(values);
    const response = await client.post(request.endpoint, request.body);
    const envelope = response.data;
    if (envelope?.success !== true) throw new Error('Máy chủ chưa xác nhận đăng ký thành công.');
    if (request.role.value !== 'NguoiChamSoc'
      && (!Number.isSafeInteger(Number(envelope.data?.userId)) || Number(envelope.data.userId) < 1
        || envelope.data.loaiTaiKhoan !== request.role.value)) throw new Error('Thông tin tài khoản đăng ký chưa được xác nhận.');
    if (request.role.value === 'NguoiCaoTuoi'
      && (!Number.isSafeInteger(Number(envelope.data.nguoiCaoTuoiId)) || Number(envelope.data.nguoiCaoTuoiId) < 1)) {
      throw new Error('Máy chủ chưa xác nhận hồ sơ Người cao tuổi đã được tạo.');
    }
    return request.role;
  };
}
