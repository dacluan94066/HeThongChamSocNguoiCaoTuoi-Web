class RelativeError extends Error {
  constructor(message, code = 'INVALID_RELATIVE_REQUEST', status = 422) {
    super(message); this.code = code; this.status = status;
  }
}
const invalid = (message) => { throw new RelativeError(message); };
const id = (value) => {
  if (!['string','number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647)
    invalid('Mã hồ sơ hoặc tài khoản không hợp lệ.');
  return Number(value);
};
const text = (value, name, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${name} là bắt buộc, tối đa ${max} ký tự.`);
  return value.trim();
};
const keys = (body, allowed) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k)))
    invalid('Yêu cầu chứa trường không được phép.');
};
const proofFields = ['moiQuanHe','dongYChiaSe','nguoiDongY','tuCachDongY','thoiDiemDongY','canCuDongY','phamViChiaSe'];
const consent = (body) => {
  if (body.dongYChiaSe !== true) invalid('Phải ghi nhận sự đồng ý chia sẻ dữ liệu.');
  keys(body.phamViChiaSe, ['benhNen', 'diUng', 'ketQuaKham']);
  for (const field of ['benhNen','diUng','ketQuaKham'])
    if (typeof body.phamViChiaSe[field] !== 'boolean') invalid('Phạm vi chia sẻ phải chỉ rõ từng quyền.');
  const time = body.thoiDiemDongY;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(time)
    || !Number.isFinite(Date.parse(time)) || Date.parse(time) > Date.now()
    || Number(time.slice(0,4)) < 1900) invalid('Thời điểm đồng ý phải hợp lệ, có múi giờ và không ở tương lai.');
  const datePart = time.slice(0,10), calendar = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== datePart) invalid('Ngày đồng ý không hợp lệ.');
  return {
    moiQuanHe: text(body.moiQuanHe,'Mối quan hệ',50), nguoiDongY: text(body.nguoiDongY,'Người đồng ý',100),
    tuCachDongY: text(body.tuCachDongY,'Tư cách đồng ý',100), canCuDongY: text(body.canCuDongY,'Căn cứ đồng ý',1000),
    thoiDiemDongY: new Date(time), benhNen: body.phamViChiaSe.benhNen, diUng: body.phamViChiaSe.diUng,
    ketQuaKham: body.phamViChiaSe.ketQuaKham,
  };
};
const version = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{11}=$/.test(value)
    || Buffer.from(value,'base64').length !== 8 || Buffer.from(value,'base64').toString('base64') !== value)
    invalid('Thiếu phiên bản liên kết hợp lệ. Vui lòng tải lại.');
  return Buffer.from(value,'base64');
};
const grant = (body) => {
  keys(body, ['nguoiCaoTuoiId','nguoiThanUserId',...proofFields]);
  return { elderlyId: id(body.nguoiCaoTuoiId), relativeId: id(body.nguoiThanUserId), ...consent(body) };
};
const update = (body) => {
  keys(body, [...proofFields,'version','lyDo']);
  return { ...consent(body), version: version(body.version), reason: text(body.lyDo,'Lý do cập nhật',500) };
};
const revoke = (body) => {
  keys(body, ['version','lyDo']);
  return { version: version(body.version), reason: text(body.lyDo,'Lý do thu hồi',500) };
};
const readOptions = (query = {}) => {
  keys(query, ['tuNgay','denNgay','loaiChiSoId','limit','offset']);
  const result = { limit: query.limit == null ? 100 : id(query.limit), offset: 0 };
  if (result.limit > 200) invalid('Chỉ được lấy tối đa 200 bản ghi mỗi lần.');
  if (query.offset != null) {
    if (!/^\d+$/.test(String(query.offset)) || Number(query.offset)>1000000) invalid('Vị trí trang không hợp lệ.');
    result.offset = Number(query.offset);
  }
  for (const field of ['tuNgay','denNgay']) if (query[field] != null) {
    const value = query[field];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1900-01-01' || value>'9998-12-31'
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) invalid('Khoảng ngày không hợp lệ.');
    result[field] = value;
  }
  if (result.tuNgay && result.denNgay && result.tuNgay > result.denNgay) invalid('Ngày bắt đầu phải trước ngày kết thúc.');
  if (query.loaiChiSoId != null) result.typeId = id(query.loaiChiSoId);
  return result;
};
module.exports = { RelativeError, id, text, keys, grant, update, revoke, readOptions };
