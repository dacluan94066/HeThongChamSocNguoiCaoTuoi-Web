// Staff and family have separate workspaces; elderly accounts remain Mobile-only.
export const STAFF_WEB_ROLES = [
  'QuanTriVien',
  'NguoiChamSoc',
];
export const WEB_ALLOWED_ROLES = [...STAFF_WEB_ROLES, 'NguoiThan'];

export const canAccessWeb = (user) =>
  WEB_ALLOWED_ROLES.includes(user?.tenVaiTro);

export const isRelativeUser = user => user?.tenVaiTro === 'NguoiThan';
export const getWebHome = user => isRelativeUser(user) ? '/nguoi-than-cua-toi' : '/dashboard';
