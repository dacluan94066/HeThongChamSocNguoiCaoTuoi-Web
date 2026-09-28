// Quy tac truy cap rieng cho ung dung Web quan tri.
// Nguoi cao tuoi su dung ung dung Mobile va khong duoc vao Web.
export const WEB_ALLOWED_ROLES = [
  'QuanTriVien',
  'BacSi',
  'NguoiChamSoc',
];

export const canAccessWeb = (user) =>
  WEB_ALLOWED_ROLES.includes(user?.tenVaiTro);

