// appointmentService.js - Lich kham benh - goi API that
import axiosClient from './axiosClient';

export const getAppointments = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  if (params.trangThai) query.trangThai = params.trangThai;
  if (params.search) query.keyword = params.search;
  const res = await axiosClient.get('/appointments', { params: query });
  return res.data?.data ?? [];
};

export const createAppointment = async (data) => {
  const res = await axiosClient.post('/appointments', data);
  return res.data?.data ?? res.data;
};

export const updateAppointment = async (id, data) => {
  const res = await axiosClient.put(`/appointments/${id}`, data);
  return res.data?.data ?? res.data;
};

export const cancelAppointment = async (id) => {
  const res = await axiosClient.patch(`/appointments/${id}/cancel`);
  return res.data?.data ?? res.data;
};

export const recordAppointmentResult = async (id, ketQuaKham) => {
  const res = await axiosClient.patch(`/appointments/${id}/result`, { ketQuaKham });
  return res.data?.data ?? res.data;
};
