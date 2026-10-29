export const RELATIVE_READ_FEATURES = ['QLHOSONCT', 'QLCHISOSK', 'QLLICHUONGTHUOC', 'QLLICHKHAM', 'QLCANHBAO', 'QLNHATKY'];
export const canViewRelativeAdmin = (user, hasPermission) => user?.tenVaiTro === 'QuanTriVien'
  && Boolean(hasPermission('QLNGUOIDUNG', 'xem'));
export const isFamilyAccount = account => account?.vaiTro === 'NGUOI_THAN' || account?.tenVaiTro === 'NguoiThan';
export const isActiveAccount = account => ['HOAT_DONG', 'HoatDong'].includes(account?.trangThai);
export const canEditRelativePermission = (role, feature, action) => role !== 'NguoiThan'
  || (action === 'xem' && RELATIVE_READ_FEATURES.includes(feature))
  || (action === 'them' && feature === 'QLCHISOSK');
export const hasActiveRelativeLink = (links, elderlyId, userId) => links.some(link => !link.thuHoiLuc
  && Number(link.nguoiCaoTuoiId) === Number(elderlyId) && Number(link.nguoiThanUserId) === Number(userId));
const invalid = (message, field) => { const error = new Error(message); error.field = field; throw error; };
const positiveId = (value, field) => {
  if (!['number', 'string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))
    || Number(value) > 2147483647) invalid('Vui lòng chọn hồ sơ hoặc tài khoản hợp lệ.', field);
  return Number(value);
};
const text = (value, field, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    invalid(`Vui lòng nhập đầy đủ, tối đa ${max} ký tự.`, field);
  return value.trim();
};
export const vietnamWallTime = (value = new Date()) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 19) : '';
};
export const consentIso = (value) => {
  const wall = value?.format ? value.format('YYYY-MM-DDTHH:mm:ss') : value;
  if (typeof wall !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wall))
    invalid('Vui lòng chọn thời điểm đồng ý hợp lệ.', 'thoiDiemDongY');
  const date = new Date(`${wall}+07:00`);
  if (!Number.isFinite(date.getTime()) || vietnamWallTime(date) !== wall || date.getTime() > Date.now())
    invalid('Thời điểm đồng ý không được ở tương lai hoặc sai ngày giờ.', 'thoiDiemDongY');
  return `${wall}+07:00`;
};
export const buildRelativeConsent = (values) => {
  if (values.dongYChiaSe !== true) invalid('Phải xác nhận đã kiểm tra sự đồng ý chia sẻ.', 'dongYChiaSe');
  const scope = values.phamViChiaSe;
  if (!scope || ['benhNen', 'diUng', 'ketQuaKham'].some(key => typeof scope[key] !== 'boolean'))
    invalid('Vui lòng xác định rõ phạm vi chia sẻ.', 'phamViChiaSe');
  return {
    moiQuanHe: text(values.moiQuanHe, 'moiQuanHe', 50), dongYChiaSe: true,
    nguoiDongY: text(values.nguoiDongY, 'nguoiDongY', 100), tuCachDongY: text(values.tuCachDongY, 'tuCachDongY', 100),
    thoiDiemDongY: consentIso(values.thoiDiemDongY), canCuDongY: text(values.canCuDongY, 'canCuDongY', 1000),
    phamViChiaSe: { benhNen: scope.benhNen, diUng: scope.diUng, ketQuaKham: scope.ketQuaKham },
  };
};
export const buildRelativeGrant = values => ({
  nguoiCaoTuoiId: positiveId(values.nguoiCaoTuoiId, 'nguoiCaoTuoiId'),
  nguoiThanUserId: positiveId(values.nguoiThanUserId, 'nguoiThanUserId'), ...buildRelativeConsent(values),
});
const version = (record) => {
  if (!record?.id || typeof record.version !== 'string' || !/^[A-Za-z0-9+/]{11}=$/.test(record.version))
    invalid('Thiếu phiên bản liên kết. Vui lòng đóng biểu mẫu và tải lại danh sách.');
  return record.version;
};
export const buildRelativeUpdate = (values, record) => ({
  ...buildRelativeConsent(values), version: version(record), lyDo: text(values.lyDo, 'lyDo', 500),
});
export const buildRelativeRevoke = (values, record) => ({ version: version(record), lyDo: text(values.lyDo, 'lyDo', 500) });
export const relativeErrorInfo = (error) => {
  const code = error?.response?.data?.errorCode;
  const notReady = code === 'RELATIVES_NOT_INSTALLED';
  const conflict = code === 'LINK_CONFLICT' || error?.response?.status === 409;
  return { notReady, conflict, forbidden: error?.response?.status === 403,
    message: notReady ? 'Chức năng Người thân chưa sẵn sàng trên cơ sở dữ liệu hiện tại.'
      : conflict ? 'Liên kết đã tồn tại, đã thay đổi hoặc đã thu hồi. Vui lòng tải lại danh sách trước khi tiếp tục.'
        : error?.response?.data?.message || (error?.field ? error.message : 'Không tải hoặc lưu được dữ liệu. Vui lòng thử lại.'),
  };
};
export const formatRelativeTimeVN = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
};
const snapshot = (value) => {
  try {
    const parsed = typeof value === 'string' && value.length <= 32768 ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};
const show = value => value == null ? 'Chưa có' : typeof value === 'boolean' ? (value ? 'Cho phép' : 'Không chia sẻ')
  : ['string', 'number'].includes(typeof value) ? String(value) : 'Không đọc được';
export const relativeHistoryChanges = (row) => {
  const before = snapshot(row.duLieuCu), after = snapshot(row.duLieuMoi);
  const fields = [
    ['Mối quan hệ', item => item.moiQuanHe], ['Người đồng ý', item => item.nguoiDongY],
    ['Tư cách đồng ý', item => item.tuCachDongY], ['Thời điểm đồng ý', item => item.thoiDiemDongY ? formatRelativeTimeVN(item.thoiDiemDongY) : null],
    ['Căn cứ đồng ý', item => item.canCuDongY], ['Bệnh nền', item => item.phamViChiaSe?.benhNen],
    ['Dị ứng', item => item.phamViChiaSe?.diUng], ['Kết quả khám', item => item.phamViChiaSe?.ketQuaKham],
    ['Lý do thu hồi', item => item.lyDoThuHoi],
  ];
  return fields.filter(([, get]) => get(before) !== get(after))
    .map(([label, get]) => ({ label, before: show(get(before)), after: show(get(after)) }));
};
