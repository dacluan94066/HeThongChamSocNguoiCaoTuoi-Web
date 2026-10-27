// Standalone RAM fixture. No .env, SQL connection, migrations, workers, or production server.
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRequire = createRequire(path.join(frontendRoot, 'package.json'));
const serverRequire = createRequire(path.join(frontendRoot, '../server/package.json'));
const validation = serverRequire('./src/utils/relativeValidation'); // Pure validation only; no DB imports.
const { createServer: createViteServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href);
const { Server: SocketServer } = serverRequire('socket.io');
const port = 5191, origin = `http://127.0.0.1:${port}`;
const features = ['QLNGUOIDUNG', 'QLHOSONCT', 'QLNGUOICHAMSOC', 'QLTHUOC', 'QLLICHUONGTHUOC', 'QLLICHKHAM', 'QLCHISOSK', 'QLCANHBAO', 'QLLIENHEKC', 'QLNHATKY', 'QLBAOCAO'];
const roles = [{ id: 1, tenVaiTro: 'QuanTriVien' }, { id: 2, tenVaiTro: 'NguoiChamSoc' }, { id: 3, tenVaiTro: 'NguoiCaoTuoi' }, { id: 4, tenVaiTro: 'NguoiThan' }];
const roleCodes = { QuanTriVien: 'QUAN_TRI', NguoiChamSoc: 'NGUOI_CHAM_SOC', NguoiCaoTuoi: 'NGUOI_CAO_TUOI', NguoiThan: 'NGUOI_THAN' };
let versionSequence = 10, historySequence = 100, accountSequence = 212, linkSequence = 2;
const nextVersion = () => { const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(++versionSequence)); return buffer.toString('base64'); };
const copy = value => JSON.parse(JSON.stringify(value));
const state = { fixtureOnly: true, ready: true, empty: false, error: false, slow: false, conflictNext: false, requests: [], writes: [], users: [], links: [], history: [] };
const user = (id, role, name, username, status = 'HOAT_DONG') => ({ id, hoTen: name, username, email: `${username}@fixture.invalid`,
  soDienThoai: '', tenVaiTro: role, vaiTroId: roles.find(r => r.tenVaiTro === role).id, vaiTro: roleCodes[role],
  trangThai: status, trangThaiLabel: status === 'HOAT_DONG' ? 'Hoạt động' : 'Đã khóa', ngayTao: new Date().toISOString().slice(0, 10), lanDangNhapCuoi: null });
const elders = [701, 702, 703].map((id, index) => ({ id, hoTen: `NCT mô phỏng ${['An', 'Bình', 'Chi'][index]}`, ngaySinh: '1952-01-02',
  gioiTinh: 'Nam', trangThai: 'DangTheoDoi', nhomMau: 'O+', benhNen: '', diUng: '', userId: index ? null : 902, tenDangNhap: index ? null : 'fixture.elder' }));
const snapshotLink = (elderlyId, relativeId) => ({ id: ++linkSequence, nguoiCaoTuoiId: elderlyId, nguoiThanUserId: relativeId,
  moiQuanHe: 'Con gái', dongYChiaSe: true, nguoiDongY: 'NCT mô phỏng', tuCachDongY: 'Bản thân NCT',
  thoiDiemDongY: new Date(Date.now() - 3600000).toISOString(), canCuDongY: 'Biên bản mô phỏng, không phải căn cứ thật',
  phamViChiaSe: { benhNen: false, diUng: false, ketQuaKham: false }, nguoiTaoId: 900, taoLuc: new Date().toISOString(),
  capNhatLuc: new Date().toISOString(), thuHoiLuc: null, nguoiThuHoiId: null, lyDoThuHoi: null, version: nextVersion() });
const audit = (link, action, before, reason) => state.history.push({ id: ++historySequence, lienKetId: link.id, hanhDong: action,
  nguoiThucHienId: 900, thoiGian: new Date().toISOString(), lyDo: reason,
  duLieuCu: before ? JSON.stringify(before) : null, duLieuMoi: JSON.stringify(link) });
function reset() {
  Object.assign(state, { ready: true, empty: false, error: false, slow: false, conflictNext: false, requests: [], writes: [], links: [], history: [] });
  state.users = [user(900, 'QuanTriVien', 'Admin mô phỏng', 'fixture.admin'), user(901, 'NguoiChamSoc', 'Chăm sóc mô phỏng', 'fixture.caregiver'),
    user(902, 'NguoiCaoTuoi', 'NCT mô phỏng', 'fixture.elder'), user(210, 'NguoiThan', 'Người thân mô phỏng Lan', 'family.lan'),
    user(211, 'NguoiThan', 'Người thân mô phỏng Minh', 'family.minh'), user(212, 'NguoiThan', 'Người thân đã khóa', 'family.locked', 'KHOA')];
  linkSequence = 0;
  const first = snapshotLink(701, 210); state.links.push(first); audit(first, 'CAP', null, 'Cấp quyền mô phỏng');
  const revoked = snapshotLink(702, 211); audit(revoked, 'CAP', null, 'Cấp quyền mô phỏng');
  const before = copy(revoked); Object.assign(revoked, { thuHoiLuc: new Date().toISOString(), nguoiThuHoiId: 900, lyDoThuHoi: 'Thu hồi mô phỏng', version: nextVersion() });
  state.links.push(revoked); audit(revoked, 'THU_HOI', before, revoked.lyDoThuHoi);
}
reset();
const send = (res, status, data, errorCode) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(errorCode ? { success: false, message: data, errorCode } : { success: true, message: 'Fixture RAM', data })); };
const bodyOf = async req => { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 30000) throw new Error('Fixture payload too large'); } return body ? JSON.parse(body) : {}; };
const apiUser = req => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (token === 'fixture-nopermission') return { ...state.users[0], id: 903, noAccountPermission: true };
  return state.users.find(person => token === `fixture-${person.tenVaiTro}` && person.id < 1000);
};
const myPermissions = account => features.map(maChucNang => ({ maChucNang, tenChucNang: maChucNang,
  xem: maChucNang === 'QLNGUOIDUNG' ? account.tenVaiTro === 'QuanTriVien' && !account.noAccountPermission : true,
  them: account.tenVaiTro === 'QuanTriVien' && !account.noAccountPermission,
  sua: account.tenVaiTro === 'QuanTriVien' && !account.noAccountPermission, xoa: account.tenVaiTro === 'QuanTriVien' && !account.noAccountPermission }));
const vite = await createViteServer({ root: frontendRoot, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', strictPort: true },
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) },
});
const server = http.createServer();
const io = new SocketServer(server, { serveClient: false });
io.use((socket, next) => socket.handshake.auth?.token?.startsWith('fixture-') ? next() : next(new Error('FIXTURE_TOKEN_REQUIRED')));
// Deliberately no SOS generation/fan-out in this Admin-only fixture.
server.on('request', async (req, res) => {
  const url = new URL(req.url, origin), pathname = url.pathname;
  try {
    if (pathname === '/__relative_fixture/state' && req.method === 'GET') return send(res, 200, state);
    if (pathname === '/__relative_fixture/viewport' && req.method === 'GET') {
      const width = [768, 1024, 1440].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 1440;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>RAM fixture viewport ${width}px</title></head><body style="margin:0;background:#dde8e7;font:14px sans-serif"><nav style="padding:10px">Fixture RAM — viewport ${width}px · ${[768,1024,1440].map(size => `<a href="?width=${size}">${size}px</a>`).join(' · ')}</nav><div id="frame-container"><iframe title="CareSenior Admin fixture" id="fixture-viewport" src="/nguoi-than?fixtureRole=QuanTriVien" width="${width}" height="1100" style="display:block;border:0;width:${width}px;height:1100px;transform-origin:top left"></iframe></div><script>function fit(){const scale=Math.min(1,innerWidth/${width});document.getElementById('fixture-viewport').style.transform='scale('+scale+')';document.getElementById('frame-container').style.height=(1100*scale)+'px';}addEventListener('resize',fit);fit();</script></body></html>`);
    }
    if (pathname === '/__relative_fixture/control' && req.method === 'POST') {
      const { action } = await bodyOf(req);
      if (action === 'reset') reset();
      else if (action === 'unready') state.ready = false;
      else if (action === 'ready') Object.assign(state, { ready: true, empty: false, error: false, slow: false });
      else if (action === 'empty') Object.assign(state, { ready: true, empty: true, error: false });
      else if (action === 'error') state.error = true;
      else if (action === 'slow') state.slow = true;
      else if (action === 'conflict') state.conflictNext = true;
      else return send(res, 422, 'Unknown fixture control', 'FIXTURE_ONLY');
      return send(res, 200, { fixtureOnly: true, action });
    }
    if (pathname.startsWith('/api/')) {
      const actor = apiUser(req);
      if (!actor) return send(res, 401, 'Chỉ token mô phỏng được phép.', 'FIXTURE_TOKEN_REQUIRED');
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await bodyOf(req) : null;
      state.requests.push({ method: req.method, path: pathname, query: Object.fromEntries(url.searchParams),
        ...(body ? { body: { ...body, ...(body.password ? { password: '<redacted>' } : {}) } } : {}) });
      if (state.requests.length > 250) state.requests.shift();
      if (pathname === '/api/auth/me' && req.method === 'GET') return send(res, 200, { ...actor, userId: actor.id });
      if (pathname === '/api/permissions/me') return send(res, 200, myPermissions(actor));
      const adminOnly = pathname.startsWith('/api/relatives') || pathname.startsWith('/api/users') || pathname === '/api/permissions/matrix';
      if (adminOnly && (actor.tenVaiTro !== 'QuanTriVien' || actor.noAccountPermission)) return send(res, 403, 'Chỉ Admin được quản lý.', 'FORBIDDEN');
      if (pathname === '/api/permissions/matrix' && req.method === 'GET') {
        const activeRoles = state.ready ? roles : roles.slice(0, 3);
        return send(res, 200, { roles: activeRoles, functions: features.map((code, index) => ({ id: index + 1, maChucNang: code, tenChucNang: code })),
          permissions: activeRoles.flatMap(role => features.map((_, index) => ({ vaiTroId: role.id, chucNangId: index + 1,
            xem: role.id === 1 || role.id === 4 && [1, 4, 5, 6, 7].includes(index), them: role.id === 1, sua: role.id === 1, xoa: role.id === 1 }))) });
      }
      if (pathname === '/api/users' && req.method === 'GET') {
        let people = state.users.filter(person => state.ready && !state.empty || person.tenVaiTro !== 'NguoiThan');
        if (url.searchParams.has('vaiTro')) people = people.filter(person => person.vaiTro === url.searchParams.get('vaiTro'));
        return send(res, 200, people);
      }
      if (pathname === '/api/users' && req.method === 'POST') {
        if (!state.ready || body.vaiTro !== 'NGUOI_THAN') return send(res, 400, 'Vai trò chưa sẵn sàng.', 'ROLE_NOT_FOUND');
        if (state.users.some(person => person.username.toLowerCase() === body.username?.trim().toLowerCase())) return send(res, 409, 'Tên đăng nhập đã tồn tại.', 'DUPLICATE');
        if (state.users.some(person => person.email.toLowerCase() === body.email?.trim().toLowerCase())) return send(res, 409, 'Email đã được sử dụng.', 'EMAIL_TAKEN');
        if (!body.hoTen?.trim() || !body.username?.trim() || !body.email?.includes('@') || typeof body.password !== 'string' || body.password.length < 6) return send(res, 422, 'Tài khoản không hợp lệ.', 'INVALID_RELATIVE_ACCOUNT');
        const account = user(++accountSequence, 'NguoiThan', body.hoTen, body.username); account.email = body.email; account.soDienThoai = body.soDienThoai || '';
        state.users.push(account); state.writes.push({ type: 'account', id: account.id }); return send(res, 201, { id: account.id });
      }
      if (pathname.startsWith('/api/relatives')) {
        if (!state.ready) return send(res, 503, 'Chức năng Người thân chưa được cài đặt trên cơ sở dữ liệu này.', 'RELATIVES_NOT_INSTALLED');
        if (state.slow && req.method === 'GET') await new Promise(resolve => setTimeout(resolve, 2200));
        if (state.error) return send(res, 503, 'Lỗi API mô phỏng; có thể thử lại.', 'RELATIVES_UNAVAILABLE');
        if (pathname === '/api/relatives/links' && req.method === 'GET') {
          let links = state.empty ? [] : state.links;
          for (const key of ['nguoiThanUserId', 'nguoiCaoTuoiId']) if (url.searchParams.has(key)) links = links.filter(link => Number(link[key]) === Number(url.searchParams.get(key)));
          if (url.searchParams.get('includeRevoked') !== 'true') links = links.filter(link => !link.thuHoiLuc);
          links = [...links].sort((a, b) => b.id - a.id);
          return send(res, 200, links.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit') || 100)));
        }
        if (pathname === '/api/relatives/links' && req.method === 'POST') {
          const value = validation.grant(body);
          if (state.links.some(link => link.nguoiCaoTuoiId === value.elderlyId && link.nguoiThanUserId === value.relativeId && !link.thuHoiLuc)) return send(res, 409, 'Liên kết đang tồn tại.', 'LINK_CONFLICT');
          const account = state.users.find(person => person.id === value.relativeId && person.vaiTro === 'NGUOI_THAN' && person.trangThai === 'HOAT_DONG');
          if (!account || !elders.some(profile => profile.id === value.elderlyId)) return send(res, 422, 'Hồ sơ hoặc tài khoản không hợp lệ.', 'INVALID_RELATIVE_REQUEST');
          const link = snapshotLink(value.elderlyId, value.relativeId);
          Object.assign(link, { moiQuanHe: value.moiQuanHe, nguoiDongY: value.nguoiDongY, tuCachDongY: value.tuCachDongY,
            thoiDiemDongY: value.thoiDiemDongY.toISOString(), canCuDongY: value.canCuDongY,
            phamViChiaSe: { benhNen: value.benhNen, diUng: value.diUng, ketQuaKham: value.ketQuaKham } });
          state.links.push(link); audit(link, 'CAP', null, 'Cấp quyền theo sự đồng ý đã ghi nhận.'); state.writes.push({ type: 'CAP', id: link.id }); return send(res, 200, link);
        }
        const match = pathname.match(/^\/api\/relatives\/links\/(\d+)(?:\/(history|revoke))?$/);
        if (match) {
          const link = state.links.find(item => item.id === Number(match[1]));
          if (!link) return send(res, 404, 'Không có liên kết.', 'NOT_FOUND');
          if (match[2] === 'history' && req.method === 'GET') {
            const records = state.history.filter(row => row.lienKetId === link.id).sort((a, b) => b.id - a.id);
            const offset = Number(url.searchParams.get('offset') || 0); return send(res, 200, records.slice(offset, offset + Number(url.searchParams.get('limit') || 50)));
          }
          if (req.method === 'PUT' || match[2] === 'revoke' && req.method === 'POST') {
            const value = req.method === 'PUT' ? validation.update(body) : validation.revoke(body);
            if (state.conflictNext) { link.version = nextVersion(); state.conflictNext = false; return send(res, 409, 'Liên kết đã đổi ở phiên khác.', 'LINK_CONFLICT'); }
            if (link.thuHoiLuc || link.version !== body.version) return send(res, 409, 'Phiên bản không còn hợp lệ.', 'LINK_CONFLICT');
            const before = copy(link);
            if (req.method === 'PUT') Object.assign(link, { moiQuanHe: value.moiQuanHe, nguoiDongY: value.nguoiDongY, tuCachDongY: value.tuCachDongY,
              canCuDongY: value.canCuDongY, thoiDiemDongY: value.thoiDiemDongY.toISOString(),
              phamViChiaSe: { benhNen: value.benhNen, diUng: value.diUng, ketQuaKham: value.ketQuaKham } });
            else Object.assign(link, { thuHoiLuc: new Date().toISOString(), nguoiThuHoiId: actor.id, lyDoThuHoi: value.reason });
            Object.assign(link, { capNhatLuc: new Date().toISOString(), version: nextVersion() });
            const action = req.method === 'PUT' ? 'CAP_NHAT' : 'THU_HOI'; audit(link, action, before, value.reason); state.writes.push({ type: action, id: link.id });
            return send(res, 200, link);
          }
        }
        return send(res, 405, 'Fixture không hỗ trợ thao tác này.', 'FIXTURE_ONLY');
      }
      if (pathname === '/api/elderly' && req.method === 'GET') return send(res, 200, elders);
      if (/^\/api\/elderly\/\d+\/prescriptions$/.test(pathname) && req.method === 'GET') return send(res, 200, []);
      if (/^\/api\/elderly\/\d+$/.test(pathname) && req.method === 'GET') return send(res, 200, elders.find(profile => profile.id === Number(pathname.split('/').pop())));
      if (req.method === 'GET' && ['/api/alerts', '/api/emergency-alerts', '/api/caregivers', '/api/health-metrics', '/api/medication-schedules', '/api/appointments'].includes(pathname)) return send(res, 200, []);
      return send(res, 405, 'Fixture chặn API ngoài phạm vi thử nghiệm.', 'FIXTURE_ONLY');
    }
    if (req.method !== 'GET') return send(res, 405, 'Không ghi ngoài API RAM fixture.', 'FIXTURE_ONLY');
    if (pathname.startsWith('/src/') || pathname.startsWith('/test/') || pathname.startsWith('/node_modules/') || pathname.startsWith('/@') || pathname.startsWith('/audio/')) return vite.middlewares(req, res, () => send(res, 404, 'Fixture asset not found', 'NOT_FOUND'));
    const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test/fixtures/relativeAdminPreview.jsx"></script></body></html>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch (error) { send(res, error.status || 503, error.status ? error.message : 'Fixture RAM error', error.code || 'FIXTURE_ERROR'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Relative Admin RAM fixture: ${origin}/nguoi-than (no SQL/.env/real SOS)`));
const close = async () => { await io.close(); await vite.close(); server.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
