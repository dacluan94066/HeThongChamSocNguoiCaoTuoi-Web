// medicationService.js - Danh muc thuoc - goi API that
import axiosClient from './axiosClient';

export const getMedications = async (params = {}) => {
  const query = {};
  if (params.search) query.keyword = params.search;
  const res = await axiosClient.get('/medications', { params: query });
  return res.data?.data ?? [];
};

export const getMedicationById = async (id) => {
  const res = await axiosClient.get(`/medications/${id}`);
  return res.data?.data ?? null;
};

export const createMedication = async (data) => {
  const res = await axiosClient.post('/medications', data);
  return res.data?.data ?? res.data;
};

export const updateMedication = async (id, data) => {
  const res = await axiosClient.put(`/medications/${id}`, data);
  return res.data?.data ?? res.data;
};

export const deleteMedication = async (id) => {
  await axiosClient.delete(`/medications/${id}`);
  return true;
};
