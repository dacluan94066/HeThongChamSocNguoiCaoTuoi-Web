import axiosClient from './axiosClient';

const paths = { elderly: '/elderly', caregiver: '/caregivers' };
const profilePath = (kind, id) => {
  if (!paths[kind] || !Number.isInteger(Number(id)) || Number(id) <= 0) {
    throw new Error('Hồ sơ không hợp lệ');
  }
  return `${paths[kind]}/${id}`;
};

export const linkProfileUser = async (kind, id, userId) => {
  const res = await axiosClient.patch(`${profilePath(kind, id)}/link-user`, { userId });
  return res.data.data;
};

export const createProfileUser = async (kind, id, values) => {
  const payload = { username: values.username.trim(), password: values.password };
  for (const key of ['email', 'soDienThoai']) {
    if (values[key]?.trim()) payload[key] = values[key].trim();
  }
  const res = await axiosClient.post(`${profilePath(kind, id)}/user`, payload);
  return res.data.data;
};
