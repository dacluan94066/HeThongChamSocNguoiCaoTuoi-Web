// elderlyService.js - Service quản lý hồ sơ người cao tuổi
// Hỗ trợ cả mock data và API thật, kiểm soát qua biến môi trường VITE_USE_MOCK
import axiosClient from './axiosClient';
import elderlyData from '../mockData/elderlyProfiles.json';
import { mockDelay } from './mockHelper';
import { calculateAge, formatEntityCode } from '../utils/displayUtils';

// Xác định chế độ: mock hay API thật
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// ─── Mock data state (chỉ dùng khi VITE_USE_MOCK=true) ─────────────────────
let elders = [...elderlyData];

// ─── Helper: Map dữ liệu từ backend về cấu trúc component đang dùng ─────────
// Backend có thể trả PascalCase hoặc camelCase, chuẩn hoá về camelCase
const mapElderFromApi = (item) => {
  const id = item.id ?? item.Id;
  const ngaySinh = item.ngaySinh ?? item.NgaySinh ?? '';
  const trangThai = item.trangThai ?? item.TrangThai ?? '';
  const statusLabels = {
    DangTheoDoi: 'Đang theo dõi',
    NgungTheoDoi: 'Ngừng theo dõi',
  };
  // Nếu backend đã trả camelCase thì dùng trực tiếp, chỉ map khi cần
  return {
    id,
    ...(Object.hasOwn(item, 'userId') ? { userId: item.userId }
      : Object.hasOwn(item, 'UserID') ? { userId: item.UserID } : {}),
    username: item.username ?? item.tenDangNhap ?? item.TenDangNhap,
    maHoSo: item.maHoSo ?? item.MaHoSo ?? formatEntityCode('NCT', id),
    hoTen: item.hoTen ?? item.HoTen ?? '',
    ngaySinh,
    tuoi: item.tuoi ?? item.Tuoi ?? calculateAge(ngaySinh),
    gioiTinh: item.gioiTinh ?? item.GioiTinh ?? '',
    // Backend có thể dùng cccd hoặc cmnd
    cmnd: item.cmnd ?? item.Cmnd ?? item.cccd ?? item.Cccd ?? '',
    diaChiThuongTru: item.diaChiThuongTru ?? item.DiaChiThuongTru ?? item.diaChi ?? item.DiaChi ?? '',
    soDienThoai: item.soDienThoai ?? item.SoDienThoai ?? '',
    nhomMau: item.nhomMau ?? item.NhomMau ?? '',
    // Bệnh nền có thể là mảng hoặc chuỗi phân cách bởi dấu phẩy
    benhNen: parseCsvOrArray(item.benhNen ?? item.BenhNen),
    // Dị ứng tương tự
    diUng: parseCsvOrArray(item.diUng ?? item.DiUng),
    tieuSuBenhLy: item.tieuSuBenhLy ?? item.TieuSuBenhLy ?? '',
    ghiChu: item.ghiChu ?? item.GhiChu ?? '',
    trangThai,
    trangThaiLabel: item.trangThaiLabel ?? item.TrangThaiLabel ?? statusLabels[trangThai] ?? 'Không xác định',
    nguoiChamSocId: item.nguoiChamSocId ?? item.NguoiChamSocId ?? null,
    nguoiChamSocTen: item.nguoiChamSocTen ?? item.NguoiChamSocTen ?? '',
    ngayNhapHoSo: item.ngayNhapHoSo ?? item.NgayNhapHoSo ?? '',
    anhDaiDien: item.anhDaiDien ?? item.AnhDaiDien ?? null,
  };
};

// Parse bệnh nền/dị ứng: nếu là chuỗi CSV thì split, nếu là mảng thì giữ nguyên
const parseCsvOrArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

// ─── getElders ───────────────────────────────────────────────────────────────
// Lấy danh sách hồ sơ người cao tuổi, hỗ trợ tìm kiếm theo keyword
export const getElders = async (params = {}) => {
  if (USE_MOCK) {
    await mockDelay();
    let result = elders.map(mapElderFromApi);
    if (params.search) {
      const s = params.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.hoTen.toLowerCase().includes(s) ||
          e.maHoSo.toLowerCase().includes(s)
      );
    }
    if (params.trangThai) result = result.filter((e) => e.trangThai === params.trangThai);
    return result;
  }

  // API thật: GET /elderly?keyword=...
  const queryParams = {};
  if (params.search) queryParams.keyword = params.search;
  if (params.trangThai) queryParams.trangThai = params.trangThai;

  const res = await axiosClient.get('/elderly', { params: queryParams });
  // Backend có thể trả mảng trực tiếp, hoặc bọc trong res.data.data
  const list = res.data?.data ?? res.data ?? [];
  return Array.isArray(list) ? list.map(mapElderFromApi) : [];
};

// ─── getElderById ─────────────────────────────────────────────────────────────
// Lấy chi tiết một hồ sơ theo ID
export const getElderById = async (id) => {
  if (USE_MOCK) {
    await mockDelay();
    const item = elders.find((e) => e.id === id);
    return item ? mapElderFromApi(item) : null;
  }

  const res = await axiosClient.get(`/elderly/${id}`);
  const item = res.data?.data ?? res.data;
  return item ? mapElderFromApi(item) : null;
};

// ─── createElder ─────────────────────────────────────────────────────────────
// Tạo hồ sơ mới: POST /elderly
// Body gồm: hoTen, ngaySinh, gioiTinh, cccd, diaChi, soDienThoai, nhomMau, benhNen, diUng
export const createElder = async (data) => {
  if (USE_MOCK) {
    await mockDelay();
    const newElder = {
      ...data,
      id: Date.now(),
      maHoSo: `NCT${String(elders.length + 1).padStart(3, '0')}`,
      ngayNhapHoSo: new Date().toISOString().slice(0, 10),
    };
    elders.push(newElder);
    return newElder;
  }

  const res = await axiosClient.post('/elderly', data);
  const item = res.data?.data ?? res.data;
  return mapElderFromApi(item);
};

// ─── updateElder ─────────────────────────────────────────────────────────────
// Cập nhật hồ sơ: PUT /elderly/:id
export const updateElder = async (id, data) => {
  if (USE_MOCK) {
    await mockDelay();
    elders = elders.map((e) => (e.id === id ? { ...e, ...data } : e));
    return elders.find((e) => e.id === id);
  }

  const res = await axiosClient.put(`/elderly/${id}`, data);
  const item = res.data?.data ?? res.data;
  return mapElderFromApi(item);
};

// ─── deleteElder ─────────────────────────────────────────────────────────────
// Xóa hồ sơ: DELETE /elderly/:id
export const deleteElder = async (id) => {
  if (USE_MOCK) {
    await mockDelay();
    elders = elders.filter((e) => e.id !== id);
    return true;
  }

  await axiosClient.delete(`/elderly/${id}`);
  return true;
};

export const assignElderCaregiver = async (id, nguoiChamSocId) => {
  if (USE_MOCK) {
    await mockDelay();
    elders = elders.map((elder) => (
      elder.id === id ? { ...elder, nguoiChamSocId } : elder
    ));
    return true;
  }

  const res = await axiosClient.put(`/elderly/${id}/caregiver`, { nguoiChamSocId });
  return res.data?.data ?? res.data;
};
