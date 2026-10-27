import axiosClient from './axiosClient';

export const getMyPermissions = async (config = {}) => {
  const response = await axiosClient.get('/permissions/me', config);
  return response.data?.data || [];
};

export const getPermissionMatrix = async () => {
  const response = await axiosClient.get('/permissions/matrix');
  return response.data?.data || { roles: [], functions: [], permissions: [] };
};

export const updatePermissionMatrix = async (permissions) => {
  const response = await axiosClient.put('/permissions/matrix', { permissions });
  return response.data?.data || response.data;
};
