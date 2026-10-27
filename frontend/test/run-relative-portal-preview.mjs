// Isolated UI fixture: RAM only; no .env, application server, SQL, worker, or real SOS.
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFrontend = createRequire(path.join(root, 'package.json'));
const requireServer = createRequire(path.join(root, '../server/package.json'));
const { READ_FEATURES, allowedRelativeRequest } = requireServer('./src/utils/relativePolicy'); // Pure policy only.
const { createServer: createViteServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(requireFrontend.resolve('@vitejs/plugin-react')).href);
const { Server } = requireServer('socket.io');
const origin = 'http://127.0.0.1:5192';
const state = { fixtureOnly: true, mode: 'ready', revoked: false, consentOff: false, requests: [], writes: [] };
const roles = ['QuanTriVien', 'NguoiChamSoc', 'NguoiCaoTuoi', 'NguoiThan'];
const names = ['Admin mô phỏng', 'Người chăm sóc mô phỏng', 'NCT mô phỏng', 'Người thân mô phỏng Lan'];
const account = role => ({ userId: 900 + roles.indexOf(role), id: 900 + roles.indexOf(role), tenVaiTro: role,
  hoTen: names[roles.indexOf(role)], tenDangNhap: `fixture.${role}`, username: `fixture.${role}`, email: 'portal@fixture.invalid' });
const features = ['QLNGUOIDUNG', 'QLHOSONCT', 'QLNGUOICHAMSOC', 'QLTHUOC', 'QLLICHUONGTHUOC', 'QLLICHKHAM', 'QLCHISOSK', 'QLCANHBAO', 'QLLIENHEKC', 'QLNHATKY', 'QLBAOCAO'];
const permissions = role => features.map(maChucNang => ({ maChucNang, xem: role === 'QuanTriVien' || role === 'NguoiChamSoc' && maChucNang !== 'QLNGUOIDUNG' || role === 'NguoiThan' && READ_FEATURES.includes(maChucNang),
  them: role === 'QuanTriVien', sua: role === 'QuanTriVien', xoa: role === 'QuanTriVien' }));
const profiles = () => [701, 702].map((id, index) => ({ id, hoTen: `NCT mô phỏng ${index ? 'Bình' : 'An'}`, tuoi: index ? 76 : 72, gioiTinh: index ? 'Nữ' : 'Nam', nhomMau: index ? 'A+' : 'O+', trangThai: 'DangTheoDoi', moiQuanHe: index ? 'Cháu gái' : 'Con gái',
  xemBenhNen: index === 1 && !state.consentOff, xemDiUng: false, xemKetQuaKham: index === 1 && !state.consentOff,
  benhNen: index && !state.consentOff ? 'Bệnh nền được đồng ý chia sẻ — fixture' : 'PRIVATE_RESTRICTED_HISTORY', diUng: 'PRIVATE_RESTRICTED_ALLERGY',
  cccd: 'PRIVATE_CCCD', diaChi: 'PRIVATE_ADDRESS', gps: 'PRIVATE_GPS', ghiChuXuLy: 'PRIVATE_INTERNAL', canCuDongY: 'PRIVATE_CONSENT' }));
const linked = () => state.mode === 'empty' ? [] : profiles().filter(person => !(state.revoked && person.id === 701));
const vnTime = hoursAgo => new Date(Date.now() - hoursAgo * 3600000 + 7 * 3600000).toISOString().slice(0, 19);
const rowsFor = (id, section) => {
  const privateFields = { nguoiCaoTuoiId: id, cccd: 'PRIVATE_CCCD', viDo: 'PRIVATE_GPS', kinhDo: 'PRIVATE_GPS', ghiChuXuLy: 'PRIVATE_INTERNAL' };
  let rows;
  if (section === 'health-metrics') rows = [0, 24, 72].map((ago, index) => ({ id: id * 100 + index, loaiChiSoId: 1, tenChiSo: 'Huyết áp', donVi: 'mmHg', giaTri: (id === 701 ? 120 : 145) + index, giaTriPhu: 80 + index, thoiGianDo: vnTime(ago + 1), laBatThuong: id === 702 }))
    .concat([{ id: id * 100 + 10, loaiChiSoId: 2, tenChiSo: 'Nhịp tim', donVi: 'lần/phút', giaTri: id === 701 ? 72 : 82, giaTriPhu: null, thoiGianDo: vnTime(2), laBatThuong: false },
      { id: id * 100 + 11, loaiChiSoId: 5, tenChiSo: 'Nhiệt độ cơ thể', donVi: '°C', giaTri: id === 701 ? 36.7 : 37.2, giaTriPhu: null, thoiGianDo: vnTime(3), laBatThuong: false }]);
  if (section === 'medication-schedules') rows = [0, 1].map((index) => ({ id: id * 100 + 20 + index,
    tenThuoc: index ? 'Tên thuốc mô phỏng dài để kiểm tra xuống dòng trên màn hình nhỏ và tablet' : `Thuốc mô phỏng của ${id === 701 ? 'An' : 'Bình'}`,
    lieuDung: 'Liều dùng từ đơn thuốc fixture', donViTinh: 'Viên', cachDung: 'Hướng dẫn dùng thuốc mô phỏng do hệ thống trả về, chỉ để kiểm tra giao diện.',
    thoiGianDuKien: vnTime(index ? 24 : 1), thoiGianThucTe: index ? null : vnTime(0.5), trangThai: index ? 'BoLo' : 'DaUong' }));
  if (section === 'appointments') rows = [{ id: id * 100 + 30, tenBenhVien: 'Cơ sở y tế mô phỏng CareSenior', chuyenKhoa: 'Nội tổng quát', bacSiPhuTrach: 'Nhân viên y tế mô phỏng',
    thoiGianKham: vnTime(48), trangThai: 'DaKham', ketQuaKham: id === 702 && !state.consentOff ? 'Kết quả được đồng ý chia sẻ — fixture' : 'PRIVATE_RESTRICTED_RESULT' }];
  if (section === 'alerts') rows = [{ id: id * 100 + 40, loaiCanhBao: 'ChiSoBatThuong', mucDo: 'TrungBinh', trangThai: 'ChuaXuLy', ngayTao: vnTime(4), noiDung: 'Có chỉ số sức khỏe ngoài ngưỡng theo dõi.' }];
  if (section === 'sos') rows = [{ id: id * 100 + 50, trangThai: 'DaTiepNhan', ngayGui: vnTime(20), ngayXuLy: null, noiDung: 'Người cao tuổi đã gửi SOS.' }];
  return (rows || []).map(row => ({ ...privateFields, ...row }));
};
const send = (res, status, data, code) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(code ? { success: false, message: data, errorCode: code } : { success: true, data })); };
const readBody = async req => { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 20000) throw new Error('Fixture body too large'); } return text ? JSON.parse(text) : {}; };
const vite = await createViteServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', strictPort: true }, define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) } });
const server = http.createServer();
const io = new Server(server, { serveClient: false });
io.use((socket, next) => socket.handshake.auth?.token?.startsWith('portal-fixture-') ? next() : next(new Error('FIXTURE_TOKEN_ONLY')));
io.on('connection', socket => { if (socket.handshake.auth.token === 'portal-fixture-NguoiThan') socket.join('fixture-relative'); });
server.on('request', async (req, res) => {
  const url = new URL(req.url, origin), pathname = url.pathname;
  try {
    if (pathname === '/__portal_fixture/state' && req.method === 'GET') return send(res, 200, state);
    if (pathname === '/__portal_fixture/control' && req.method === 'POST') {
      const { action } = await readBody(req);
      if (action === 'reset') Object.assign(state, { mode: 'ready', revoked: false, consentOff: false, requests: [], writes: [] });
      else if (action === 'revoke') { state.revoked = true; io.to('fixture-relative').emit('relatives:access-changed', { nguoiCaoTuoiId: 701, action: 'THU_HOI' }); }
      else if (action === 'scope-off') { state.consentOff = true; io.to('fixture-relative').emit('relatives:access-changed', { nguoiCaoTuoiId: 702, action: 'CAP_NHAT' }); }
      else if (['ready', 'unready', 'empty', 'error', 'slow', 'denied', 'expired', 'health-error'].includes(action)) state.mode = action;
      else return send(res, 422, 'Unknown fixture control', 'FIXTURE_ONLY');
      return send(res, 200, { fixtureOnly: true, action });
    }
    if (pathname === '/__portal_fixture/viewport') {
      const width = [360, 768, 1024, 1440].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 1440;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>Portal RAM viewport ${width}px</title></head><body style="margin:0;background:#e5eeeb;font:13px sans-serif"><nav style="padding:10px">Fixture RAM · ${[360,768,1024,1440].map(size => `<a href="?width=${size}">${size}px</a>`).join(' · ')}<p id="metrics">Đang đo bố cục...</p></nav><div id="frame-container" style="width:100%;overflow:hidden"><iframe id="fixture-viewport" title="Web Người thân fixture" src="/nguoi-than-cua-toi?fixtureRole=NguoiThan" width="${width}" height="1300" style="display:block;border:0;width:${width}px;height:1300px;transform-origin:top left"></iframe></div><script>function fit(){const scale=Math.min(1,innerWidth/${width});document.getElementById('fixture-viewport').style.transform='scale('+scale+')';document.getElementById('frame-container').style.height=(1300*scale)+'px';}addEventListener('resize',fit);addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.fixtureLayout)document.getElementById('metrics').textContent=JSON.stringify(event.data.fixtureLayout)});fit();</script></body></html>`);
    }
    if (pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : null;
      const role = req.headers.authorization?.replace('Bearer portal-fixture-', '');
      state.requests.push({ method: req.method, path: pathname, query: Object.fromEntries(url.searchParams), role,
        ...(body ? { body: { ...body, ...(body.matKhau ? { matKhau: '<redacted>' } : {}), ...(body.matKhauHienTai ? { matKhauHienTai: '<redacted>', matKhauMoi: '<redacted>' } : {}) } } : {}) });
      if (state.requests.length > 400) state.requests.shift();
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const loginRole = roles.find(item => body.tenDangNhap === `fixture.${item}`);
        if (!loginRole || body.matKhau !== 'fixture-only-123') return send(res, 401, 'Sai thông tin fixture.', 'INVALID_CREDENTIALS');
        if (loginRole === 'NguoiCaoTuoi') return send(res, 403, 'Chỉ dùng Mobile.', 'WEB_ACCESS_DENIED');
        state.writes.push({ type: 'fixture-login', role: loginRole }); return send(res, 200, { token: `portal-fixture-${loginRole}`, user: account(loginRole) });
      }
      if (!roles.includes(role)) return send(res, 401, 'Chỉ token fixture được phép.', 'FIXTURE_TOKEN_ONLY');
      if (role === 'NguoiThan' && state.mode === 'expired') return send(res, 401, 'Phiên fixture hết hạn.', 'TOKEN_EXPIRED');
      if (role === 'NguoiThan' && !allowedRelativeRequest({ method: req.method, originalUrl: pathname })) return send(res, 403, 'Người thân không được gọi API này.', 'FORBIDDEN');
      if (pathname === '/api/auth/me') return send(res, 200, account(role));
      if (pathname === '/api/permissions/me') return send(res, 200, permissions(role));
      if (pathname === '/api/auth/change-password' && req.method === 'POST') { state.writes.push({ type: 'fixture-own-password', role }); return send(res, 200, {}); }
      if (pathname.startsWith('/api/relatives/me/')) {
        if (role !== 'NguoiThan') return send(res, 403, 'Chỉ Người thân được xem.', 'FORBIDDEN');
        if (state.mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1600));
        if (state.mode === 'unready') return send(res, 503, 'Chưa cài schema.', 'RELATIVES_NOT_INSTALLED');
        if (state.mode === 'denied') return send(res, 403, 'Liên kết không còn hiệu lực.', 'FORBIDDEN_ELDERLY');
        if (state.mode === 'error') return send(res, 503, 'Lỗi mô phỏng.', 'RELATIVES_UNAVAILABLE');
        if (pathname === '/api/relatives/me/elderly') {
          const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 100);
          return send(res, 200, linked().slice(offset, offset + limit));
        }
        const match = pathname.match(/^\/api\/relatives\/me\/elderly\/(\d+)(?:\/([a-z-]+))?$/);
        if (!match || !linked().some(person => person.id === Number(match[1]))) return send(res, 403, 'Không có quyền xem NCT.', 'FORBIDDEN_ELDERLY');
        const id = Number(match[1]);
        if (!match[2]) return send(res, 200, linked().find(person => person.id === id));
        if (!['health-metrics', 'medication-schedules', 'appointments', 'alerts', 'sos'].includes(match[2])) return send(res, 404, 'Không có endpoint này.', 'NOT_FOUND');
        if (state.mode === 'health-error' && match[2] === 'health-metrics') return send(res, 500, 'Lỗi số đo mô phỏng.', 'FIXTURE_HEALTH_ERROR');
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 100);
        return send(res, 200, rowsFor(id, match[2]).slice(offset, offset + limit));
      }
      // Minimal existing staff page reads for role-routing regression; never a production fallback.
      if (req.method === 'GET' && ['/api/alerts', '/api/emergency-alerts', '/api/caregivers', '/api/medication-schedules', '/api/appointments', '/api/health-metrics'].includes(pathname)) return send(res, 200, []);
      if (req.method === 'GET' && pathname === '/api/elderly') return send(res, 200, profiles());
      if (req.method === 'GET' && pathname === '/api/users' && role === 'QuanTriVien') return send(res, 200, roles.map(account));
      if (req.method === 'GET' && pathname === '/api/permissions/matrix' && role === 'QuanTriVien') return send(res, 200, { roles: [], functions: [], permissions: [] });
      return send(res, 405, 'Fixture chặn API ngoài phạm vi.', 'FIXTURE_ONLY');
    }
    if (req.method !== 'GET') return send(res, 405, 'Fixture không ghi ngoài RAM.', 'FIXTURE_ONLY');
    if (/^\/(src|test|node_modules|@|audio)/.test(pathname)) return vite.middlewares(req, res, () => send(res, 404, 'Fixture asset not found', 'NOT_FOUND'));
    const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test/fixtures/relativePortalPreview.jsx"></script></body></html>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch { send(res, 503, 'RAM fixture error.', 'FIXTURE_ERROR'); }
});
server.listen(5192, '127.0.0.1', () => console.log(`${origin}/login — RAM fixture, no SQL/.env/real SOS`));
const close = async () => { await io.close(); await vite.close(); server.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
