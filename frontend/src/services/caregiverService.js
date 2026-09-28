// caregiverService.js - Nguoi cham soc - goi API that
import axiosClient from './axiosClient';

export const getCaregivers = async (params = {}) => {
  const query = {};
  if (params.search) query.keyword = params.search;
  const res = await axiosClient.get('/caregivers', { params: query });
  return res.data?.data ?? [];
};

export const getCaregiverById = async (id) => {
  const res = await axiosClient.get(`/caregivers/${id}`);
  return res.data?.data ?? null;
};

export const createCaregiver = async (data) => {
  const res = await axiosClient.post('/caregivers', data);
  return res.data?.data ?? res.data;
};

export const updateCaregiver = async (id, data) => {
  const res = await axiosClient.put(`/caregivers/${id}`, data);
  return res.data?.data ?? res.data;
};
