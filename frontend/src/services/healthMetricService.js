// healthMetricService.js - Chi so suc khoe - goi API that
import axiosClient from './axiosClient';

export const getHealthMetrics = async (params = {}) => {
  const query = {};
  if (params.nguoiCaoTuoiId) query.nguoiCaoTuoiId = params.nguoiCaoTuoiId;
  if (params.loaiChiSo) query.loaiChiSo = params.loaiChiSo;
  const res = await axiosClient.get('/health-metrics', { params: query });
  return res.data?.data ?? [];
};

export const createHealthMetric = async (data) => {
  const res = await axiosClient.post('/health-metrics', data);
  return res.data?.data ?? res.data;
};
