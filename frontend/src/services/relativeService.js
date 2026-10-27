import axiosClient from './axiosClient';
// Reuse the authenticated client. No fallback data and no database installation requests.
export const createRelativeAdminService = (client) => {
  const rows = response => {
    if (!Array.isArray(response.data?.data)) throw new Error('Phản hồi danh sách không hợp lệ.');
    return response.data.data;
  };
  const query = (params, allowed) => Object.fromEntries(allowed.filter(key => params[key] !== undefined).map(key => [key, params[key]]));
  const linkId = value => {
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) throw new Error('Mã liên kết không hợp lệ.');
    return Number(value);
  };
  return {
    getLinks: async (params = {}, { signal } = {}) => rows(await client.get('/relatives/links', { signal,
      params: query(params, ['nguoiCaoTuoiId', 'nguoiThanUserId', 'includeRevoked', 'limit', 'offset']) })),
    grant: async payload => (await client.post('/relatives/links', payload)).data.data,
    update: async (id, payload) => (await client.put(`/relatives/links/${linkId(id)}`, payload)).data.data,
    revoke: async (id, payload) => (await client.post(`/relatives/links/${linkId(id)}/revoke`, payload)).data.data,
    history: async (id, params = {}, { signal } = {}) => rows(await client.get(`/relatives/links/${linkId(id)}/history`, {
      signal, params: query(params, ['limit', 'offset']) })),
  };
};
const service = createRelativeAdminService(axiosClient);
export const getRelativeLinks = service.getLinks;
export const grantRelativeLink = service.grant;
export const updateRelativeLink = service.update;
export const revokeRelativeLink = service.revoke;
export const getRelativeLinkHistory = service.history;
