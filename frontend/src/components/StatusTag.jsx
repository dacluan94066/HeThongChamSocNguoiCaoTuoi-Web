// src/components/StatusTag.jsx
// Tag trạng thái chuẩn màu — nhất quán toàn bộ ứng dụng
import React from 'react';
import { Tag } from 'antd';
import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  FireFilled,
  StopFilled,
  MinusCircleFilled,
} from '@ant-design/icons';

/**
 * Ánh xạ status → màu sắc + icon theo semantic y tế
 *
 * status:
 *   'success'  → xanh lá (#4CAF93)  — Đã xử lý, Đã uống, Bình thường, Hoạt động
 *   'warning'  → vàng cam (#F5A623) — Cần chú ý, Trung bình, Đang chờ
 *   'danger'   → đỏ (#E15554)       — Khẩn cấp, Bỏ lỡ, Bất thường
 *   'urgent'   → đỏ đậm + pulse     — KHẨN CẤP (mức cao nhất)
 *   'info'     → xanh dương (#2E7D9A) — Thông tin, Đang xử lý
 *   'default'  → xám               — Chưa xử lý, Chưa đến giờ
 *   'inactive' → xám đậm           — Đã khóa, Không hoạt động
 */

const STATUS_MAP = {
  success: {
    color: '#4CAF93', bg: '#E8F8F5', border: '#A8DFCE',
    icon: <CheckCircleFilled />,
  },
  warning: {
    color: '#D4870A', bg: '#FEF6E6', border: '#F5A623',
    icon: <ExclamationCircleFilled />,
  },
  danger: {
    color: '#E15554', bg: '#FDEEEE', border: '#F5A5A4',
    icon: <CloseCircleFilled />,
  },
  urgent: {
    color: '#FFFFFF', bg: '#C0392B', border: '#A93226',
    icon: <FireFilled />,
    bold: true,
    pulse: true,
  },
  info: {
    color: '#2E7D9A', bg: '#EBF5FB', border: '#A8D4E6',
    icon: <ClockCircleFilled />,
  },
  default: {
    color: '#6B7C8A', bg: '#F0F4F7', border: '#C8D6DE',
    icon: <MinusCircleFilled />,
  },
  inactive: {
    color: '#FFFFFF', bg: '#8C8C8C', border: '#6B6B6B',
    icon: <StopFilled />,
  },
};

/**
 * @param {string}    status    - Một trong các key của STATUS_MAP
 * @param {string}    label     - Văn bản hiển thị
 * @param {boolean}   showIcon  - Có hiển thị icon không (mặc định: true)
 * @param {string}    size      - 'default' | 'small'
 */
const StatusTag = ({ status = 'default', label, showIcon = true, size = 'default', style }) => {
  const cfg = STATUS_MAP[status] || STATUS_MAP.default;

  return (
    <Tag
      icon={showIcon ? cfg.icon : null}
      style={{
        background:   cfg.bg,
        borderColor:  cfg.border,
        color:        cfg.color,
        fontWeight:   cfg.bold ? 700 : 600,
        fontSize:     size === 'small' ? 13 : 14,
        padding:      size === 'small' ? '2px 8px' : '4px 12px',
        borderRadius: 6,
        animation:    cfg.pulse ? 'pulse-urgent 1.5s ease infinite' : 'none',
        ...style,
      }}
    >
      {label}
    </Tag>
  );
};

// Helper functions để convert từ giá trị dữ liệu → status
export const getAlertLevelStatus = (mucDo) => {
  const map = {
    THAP:       { status: 'info',    label: 'Thấp' },
    TRUNG_BINH: { status: 'warning', label: 'Trung bình' },
    CAO:        { status: 'danger',  label: 'Cao' },
    KHAN_CAP:   { status: 'urgent',  label: '🚨 Khẩn cấp' },
  };
  return map[mucDo] || { status: 'default', label: mucDo };
};

export const getAlertStatusMap = (trangThai) => {
  const map = {
    CHUA_XU_LY: { status: 'danger',  label: 'Chưa xử lý' },
    DA_XEM:     { status: 'warning', label: 'Đã xem' },
    DA_XU_LY:   { status: 'success', label: 'Đã xử lý' },
  };
  return map[trangThai] || { status: 'default', label: trangThai };
};

export const getMedStatusMap = (trangThai) => {
  const map = {
    DA_UONG:     { status: 'success', label: 'Đã uống' },
    BO_LO:       { status: 'danger',  label: 'Bỏ lỡ' },
    CHUA_DEN_GIO:{ status: 'default', label: 'Chưa đến giờ' },
  };
  return map[trangThai] || { status: 'default', label: trangThai };
};

export const getAppointmentStatusMap = (trangThai) => {
  const map = {
    SAP_TOI:    { status: 'info',    label: 'Sắp tới' },
    DA_KHAM:    { status: 'success', label: 'Đã khám' },
    HUY:        { status: 'inactive',label: 'Hủy' },
    TRE_LICH:   { status: 'warning', label: 'Trễ lịch' },
  };
  return map[trangThai] || { status: 'default', label: trangThai };
};

export const getUserStatusMap = (trangThai) => {
  const map = {
    HOAT_DONG: { status: 'success',  label: 'Hoạt động' },
    KHOA:      { status: 'inactive', label: 'Đã khóa' },
  };
  return map[trangThai] || { status: 'default', label: trangThai };
};

export const getElderStatusMap = (trangThai) => {
  const map = {
    BINH_THUONG:          { status: 'success', label: 'Bình thường' },
    CAN_CHAM_SOC_DAC_BIET:{ status: 'danger',  label: 'Cần chăm sóc đặc biệt' },
  };
  return map[trangThai] || { status: 'default', label: trangThai };
};

export const getHealthStatusMap = (binhThuong) => {
  return binhThuong
    ? { status: 'success', label: 'Bình thường' }
    : { status: 'danger',  label: 'Bất thường' };
};

export default StatusTag;
