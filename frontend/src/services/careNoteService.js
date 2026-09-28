// careNoteService.js - Nhat ky cham soc - goi API that
import axiosClient from './axiosClient';

export const getCareNotes = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  if (params.ngay) query.ngay = params.ngay;
  const res = await axiosClient.get('/care-notes', { params: query });
  return res.data?.data ?? [];
};

export const createCareNote = async (data) => {
  const res = await axiosClient.post('/care-notes', data);
  return res.data?.data ?? res.data;
};
