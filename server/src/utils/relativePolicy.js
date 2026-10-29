// Family access is an explicit capability, never an alias for a caregiver.
const READ_FEATURES = Object.freeze(['QLHOSONCT', 'QLCHISOSK', 'QLLICHUONGTHUOC', 'QLLICHKHAM', 'QLCANHBAO', 'QLNHATKY']);
const isRelative = (req) => req.user?.tenVaiTro === 'NguoiThan';
const allowedRelativeRequest = (req) => {
  const method = req.method?.toUpperCase();
  const path = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  if (['GET', 'HEAD'].includes(method)) {
    return /^\/api\/relatives(?:\/|$)/.test(path)
      || ['/api/auth/me', '/api/auth/login-history', '/api/permissions/me', '/api/health-metric-types'].includes(path);
  }
  return (method === 'POST' && path === '/api/auth/change-password')
    || (method === 'PUT' && path === '/api/users/me/password')
    || (method === 'POST' && /^\/api\/relatives\/me\/elderly\/\d+\/health-metrics$/.test(path));
};
const relativePermission = (feature, action) =>
  (action === 'xem' && READ_FEATURES.includes(feature))
  || (feature === 'QLCHISOSK' && action === 'them');
module.exports = { READ_FEATURES, isRelative, allowedRelativeRequest, relativePermission };
