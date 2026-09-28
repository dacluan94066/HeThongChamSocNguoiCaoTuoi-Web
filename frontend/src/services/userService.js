// userService.js - Quan ly nguoi dung - goi API that
import axiosClient from './axiosClient';

export const getUsers = async (params = {}) => {
  const query = {};
  if (params.search) query.keyword = params.search;
  if (params.vaiTro) query.vaiTro = params.vaiTro;
  if (params.trangThai) query.trangThai = params.trangThai;
  const res = await axiosClient.get('/users', { params: query });
  return res.data?.data ?? [];
};

export const getUserById = async (id) => {
  const res = await axiosClient.get(`/users/${id}`);
  return res.data?.data ?? null;
};

export const createUser = async (data) => {
  const res = await axiosClient.post('/users', data);
  return res.data?.data ?? res.data;
};

export const updateUser = async (id, data) => {
  const res = await axiosClient.put(`/users/${id}`, data);
  return res.data?.data ?? res.data;
};

export const toggleUserStatus = async (id) => {
  const res = await axiosClient.patch(`/users/${id}/toggle-status`);
  return res.data?.data ?? res.data;
};
