// emergencyService.js - Lien he khan cap - goi API that
import axiosClient from './axiosClient';

export const getEmergencyContacts = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  const res = await axiosClient.get('/emergency-contacts', { params: query });
  return res.data?.data ?? [];
};

export const createContact = async (data) => {
  const res = await axiosClient.post('/emergency-contacts', data);
  return res.data?.data ?? res.data;
};

export const updateContact = async (id, data) => {
  const res = await axiosClient.put(`/emergency-contacts/${id}`, data);
  return res.data?.data ?? res.data;
};

export const deleteContact = async (id) => {
  await axiosClient.delete(`/emergency-contacts/${id}`);
  return true;
};
