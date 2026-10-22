// careNoteService.js - Nhat ky cham soc - goi API that
import axiosClient from './axiosClient';

export const getCareNotes = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  if (params.ngay) query.ngay = params.ngay;
  if (params.tuNgay) query.tuNgay = params.tuNgay;
  if (params.denNgay) query.denNgay = params.denNgay;
  if (params.loaiNhatKy) query.loaiNhatKy = params.loaiNhatKy;
  if (params.search?.trim()) query.search = params.search.trim();
  const res = await axiosClient.get('/care-notes', { params: query });
  return res.data?.data ?? [];
};

export const createCareNote = async (data) => {
  const res = await axiosClient.post('/care-notes', data);
  return res.data?.data ?? res.data;
};

export const updateCareNote = async (id, data) => {
  const res = await axiosClient.patch(`/care-notes/${id}`, data);
  return res.data?.data ?? res.data;
};
export const deleteCareNote = async (id, data) => {
  const res = await axiosClient.delete(`/care-notes/${id}`, { data });
  return res.data?.data ?? res.data;
};
export const getCareNoteHistory = async (id) => {
  const res = await axiosClient.get(`/care-notes/${id}/history`);
  return res.data?.data ?? [];
};
