// Each role enters its own workspace; Web access never grants staff privileges.
export const STAFF_WEB_ROLES = [
  'QuanTriVien',
  'NguoiChamSoc',
];
export const WEB_ALLOWED_ROLES = [...STAFF_WEB_ROLES, 'NguoiThan', 'NguoiCaoTuoi'];

export const canAccessWeb = (user) =>
  WEB_ALLOWED_ROLES.includes(user?.tenVaiTro);

export const isRelativeUser = user => user?.tenVaiTro === 'NguoiThan';
export const isElderlyUser = user => user?.tenVaiTro === 'NguoiCaoTuoi';
export const getWebHome = user => isRelativeUser(user) ? '/nguoi-than-cua-toi' : isElderlyUser(user) ? '/ca-nhan' : '/dashboard';
