import React from 'react';
import { Tag } from 'antd';

const STATUS_MAP = {
  success: { color: '#2F8F6B', bg: '#E8F8F1', border: '#B8E3D2' },
  warning: { color: '#B97808', bg: '#FFF7E6', border: '#F5D69A' },
  danger: { color: '#D64545', bg: '#FFF0F0', border: '#F2B8B8' },
  urgent: { color: '#FFFFFF', bg: '#C0392B', border: '#A93226', bold: true, pulse: true },
  info: { color: '#26728C', bg: '#EBF6FA', border: '#B6DCE8' },
  default: { color: '#667985', bg: '#F2F5F7', border: '#D5DFE4' },
  inactive: { color: '#687780', bg: '#EEF1F3', border: '#D1D9DE' },
};

const unknownStatus = { status: 'default', label: 'Không xác định' };

const StatusTag = ({ status = 'default', label, showIcon = true, size = 'default', style }) => {
  const config = STATUS_MAP[status] || STATUS_MAP.default;

  return (
    <Tag
      className="status-tag"
      style={{
        background: config.bg,
        borderColor: config.border,
        color: config.color,
        fontWeight: config.bold ? 700 : 600,
        fontSize: size === 'small' ? 12 : 13,
        padding: size === 'small' ? '2px 8px' : '4px 11px',
        borderRadius: 999,
        animation: config.pulse ? 'pulse-urgent 1.5s ease infinite' : 'none',
        ...style,
      }}
    >
      {showIcon && <span className="status-dot" style={{ backgroundColor: config.color }} />}
      {label || unknownStatus.label}
    </Tag>
  );
};

export const getAlertLevelStatus = (value) => ({
  Thap: { status: 'info', label: 'Thấp' },
  THAP: { status: 'info', label: 'Thấp' },
  TrungBinh: { status: 'warning', label: 'Trung bình' },
  TRUNG_BINH: { status: 'warning', label: 'Trung bình' },
  Cao: { status: 'danger', label: 'Cao' },
  CAO: { status: 'danger', label: 'Cao' },
  KhanCap: { status: 'urgent', label: 'Khẩn cấp' },
  KHAN_CAP: { status: 'urgent', label: 'Khẩn cấp' },
}[value] || unknownStatus);

export const getAlertStatusMap = (value) => ({
  ChuaXuLy: { status: 'danger', label: 'Chưa xử lý' },
  CHUA_XU_LY: { status: 'danger', label: 'Chưa xử lý' },
  DaXem: { status: 'warning', label: 'Đã xem' },
  DA_XEM: { status: 'warning', label: 'Đã xem' },
  DaXuLy: { status: 'success', label: 'Đã xử lý' },
  DA_XU_LY: { status: 'success', label: 'Đã xử lý' },
  BoQua: { status: 'inactive', label: 'Bỏ qua' },
  BO_QUA: { status: 'inactive', label: 'Bỏ qua' },
}[value] || unknownStatus);

export const getMedStatusMap = (value) => ({
  ChuaDenGio: { status: 'default', label: 'Chưa đến giờ' },
  CHUA_DEN_GIO: { status: 'default', label: 'Chưa đến giờ' },
  DaUong: { status: 'success', label: 'Đã uống' },
  DA_UONG: { status: 'success', label: 'Đã uống' },
  BoLo: { status: 'danger', label: 'Bỏ lỡ' },
  BO_LO: { status: 'danger', label: 'Bỏ lỡ' },
  TuChoi: { status: 'warning', label: 'Từ chối' },
  TU_CHOI: { status: 'warning', label: 'Từ chối' },
}[value] || unknownStatus);

export const getAppointmentStatusMap = (value) => ({
  ChuaDen: { status: 'info', label: 'Chưa đến' },
  CHUA_DEN: { status: 'info', label: 'Chưa đến' },
  SAP_TOI: { status: 'info', label: 'Sắp tới' },
  DaKham: { status: 'success', label: 'Đã khám' },
  DA_KHAM: { status: 'success', label: 'Đã khám' },
  Huy: { status: 'inactive', label: 'Đã hủy' },
  HUY: { status: 'inactive', label: 'Đã hủy' },
  DaDoiLich: { status: 'warning', label: 'Đã đổi lịch' },
  DA_DOI_LICH: { status: 'warning', label: 'Đã đổi lịch' },
  TRE_LICH: { status: 'warning', label: 'Trễ lịch' },
}[value] || unknownStatus);

export const getUserStatusMap = (value) => ({
  HoatDong: { status: 'success', label: 'Hoạt động' },
  HOAT_DONG: { status: 'success', label: 'Hoạt động' },
  KhoaTaiKhoan: { status: 'inactive', label: 'Đã khóa' },
  KHOA: { status: 'inactive', label: 'Đã khóa' },
  ChoDuyet: { status: 'warning', label: 'Chờ duyệt' },
  CHO_DUYET: { status: 'warning', label: 'Chờ duyệt' },
}[value] || unknownStatus);

export const getElderStatusMap = (value) => ({
  DangTheoDoi: { status: 'success', label: 'Đang theo dõi' },
  NgungTheoDoi: { status: 'inactive', label: 'Ngừng theo dõi' },
  BINH_THUONG: { status: 'success', label: 'Bình thường' },
  CAN_CHAM_SOC_DAC_BIET: { status: 'danger', label: 'Cần chăm sóc đặc biệt' },
}[value] || unknownStatus);

export const getHealthStatusMap = (normal) => normal
  ? { status: 'success', label: 'Bình thường' }
  : { status: 'danger', label: 'Bất thường' };

export default StatusTag;
