import axiosClient from './axiosClient';

export const getMyPermissions = async () => {
  const response = await axiosClient.get('/permissions/me');
  return response.data?.data || [];
};
