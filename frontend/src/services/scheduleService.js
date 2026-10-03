// scheduleService.js - Lich uong thuoc - goi API that
import axiosClient from './axiosClient';

export const getSchedules = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  if (params.trangThai) query.trangThai = params.trangThai;
  const res = await axiosClient.get('/medication-schedules', { params: query });
  return res.data?.data ?? [];
};

export const updateScheduleStatus = async (id, trangThai) => {
  const res = await axiosClient.patch(`/medication-schedules/${id}/status`, { trangThai });
  return res.data?.data ?? res.data;
};

export const createPrescription = async (elderlyId, data) => {
  const res = await axiosClient.post(`/elderly/${elderlyId}/prescriptions`, data);
  return res.data?.data ?? res.data;
};

export const getPrescriptions = async (elderlyId) => {
  const res = await axiosClient.get(`/elderly/${elderlyId}/prescriptions`);
  return res.data?.data ?? [];
};
