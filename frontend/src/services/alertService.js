// alertService.js - Canh bao suc khoe - goi API that
import axiosClient from './axiosClient';

export const getAlerts = async (params = {}) => {
  const query = {};
  if (params.mucDo) query.mucDo = params.mucDo;
  if (params.trangThai) query.trangThai = params.trangThai;
  const res = await axiosClient.get('/alerts', { params: query });
  return res.data?.data ?? [];
};

export const markAlertSeen = async (id, nguoiXuLy) => {
  const res = await axiosClient.patch(`/alerts/${id}/seen`, { nguoiXuLy });
  return res.data?.data ?? res.data;
};

export const resolveAlert = async (id, nguoiXuLy, ghiChu) => {
  const res = await axiosClient.patch(`/alerts/${id}/resolve`, { nguoiXuLy, ghiChu });
  return res.data?.data ?? res.data;
};

export const getEmergencyAlerts = async () => {
  const res = await axiosClient.get('/emergency-alerts');
  return res.data?.data ?? [];
};

export const markEmergencyAlertSeen = async (id) => {
  const res = await axiosClient.patch(`/emergency-alerts/${id}/seen`);
  return res.data?.data ?? res.data;
};

export const resolveEmergencyAlert = async (id, ghiChu) => {
  const res = await axiosClient.patch(`/emergency-alerts/${id}/resolve`, { ghiChu });
  return res.data?.data ?? res.data;
};
