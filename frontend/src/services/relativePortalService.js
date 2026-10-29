import axiosClient from './axiosClient';
import { createRelativePortalApi, portalId } from '../utils/relativePortalData';

const baseApi = createRelativePortalApi(axiosClient);

const relativePortalService = {
  ...baseApi,
  async createHealthMetric(elderlyId, payload, signal) {
    elderlyId = portalId(elderlyId);
    const res = await axiosClient.post(`/relatives/me/elderly/${elderlyId}/health-metrics`, payload, { signal });
    return res.data;
  },
  async getMetricTypes(signal) {
    const res = await axiosClient.get('/health-metric-types', { signal });
    return res.data?.data || [];
  },
};

export default relativePortalService;
