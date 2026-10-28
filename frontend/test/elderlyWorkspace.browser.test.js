import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CARESENIOR_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const requireServer = createRequire(path.join(root, '../server/package.json'));
const { Server } = requireServer('socket.io');
const { validateMetricValues } = requireServer('./src/utils/healthMetricValidation');
const { createGoogleFixture } = requireServer('./test/fixtures/google-web-fixture.cjs');
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
const metricTypes = [{ id: 1, tenChiSo: 'Huyết áp', donVi: 'mmHg', giaTriMin2: 60, giaTriMax2: 90 },
  { id: 2, tenChiSo: 'Nhiệt độ cơ thể', donVi: '°C' }, { id: 3, tenChiSo: 'Nhịp tim', donVi: 'lần/phút' }];
test('NCT Web workspace in isolated Chrome (RAM API only, no SQL/.env)', { skip: !existsSync(chrome), timeout: 900000 }, async t => {
  let report, fixture;
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const io = new Server(server);
  io.use((socket, next) => String(socket.handshake.auth?.token || '').startsWith('fixture-') ? next() : next(new Error('FIXTURE_ONLY')));
  io.on('connection', socket => { const userId = socket.handshake.auth.token === 'fixture-switched' ? 71 : 70; socket.join(`fixture-user:${userId}`); fixture.connections++; });
  const send = (res, status, data, message = 'Fixture RAM', errorCode) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, message, errorCode })); };
  server.on('request', async (req, res) => {
    try {
      if (req.url.startsWith('/socket.io')) return;
      if (req.url === '/__ownRelativesControl') {
        let body = ''; for await (const chunk of req) body += chunk;
        fixture.ownRelativesMode = JSON.parse(body).mode; return send(res, 200, null);
      }
      if (req.url === '/__elderly_progress') { let body = ''; for await (const chunk of req) body += chunk; fixture.progress = body; return send(res, 200, null); }
      if (req.url === '/__elderly_result') { let body = ''; for await (const chunk of req) body += chunk; report = JSON.parse(body); return send(res, 200, null); }
      if (req.url === '/__safety_control') {
        let body = ''; for await (const chunk of req) body += chunk; const action = JSON.parse(body).action;
        if (action === 'reconnect') for (const socket of io.sockets.sockets.values()) socket.conn.close();
        if (action === 'release') { fixture.releaseSos?.(); fixture.releaseSos = null; }
        if (action === 'release-chat') { fixture.releaseChat?.(); fixture.releaseChat = null; }
        if (action === 'hold-types') { fixture.holdTypes = true; io.to('fixture-user:70').emit('chisuckhoe:new', { id: 500, nguoiCaoTuoiId: 170 }); }
        if (action === 'release-types') { fixture.holdTypes = false; for (const release of fixture.typeReplies || []) release(); fixture.typeReplies = []; }
        if (action === 'notice') {
          fixture.notices.push({ id: 2, tieuDe: 'Thông báo realtime fixture mới', noiDung: 'Chỉ một bản ghi khi sự kiện lặp', lienKetBang: 'LichUongThuoc', lienKetId: 1, daDoc: false, ngayTao: '2026-10-27T13:05:00' });
          for (let i = 0; i < 8; i++) io.to('fixture-user:70').emit('thongbao:new', { id: 2 });
        }
        if (action === 'foreign') { io.to('fixture-user:70').emit('canhbao:new', { id: 999, nguoiCaoTuoiId: 999, noiDung: 'FOREIGN SECRET' }); io.to('fixture-user:70').emit('thongbao:new', { id: 999, userId: 999 }); }
        if (action === 'own-alert') {
          fixture.alerts.push({ id: 3, nguoiCaoTuoiId: 170, noiDung: 'Cảnh báo realtime fixture đúng tài khoản', loaiCanhBao: 'ChiSoBatThuong', mucDo: 'TrungBinh', trangThai: 'ChuaXuLy', ngayTao: '2026-10-27T23:55:00' });
          io.to('fixture-user:70').emit('canhbao:new', { id: 3, nguoiCaoTuoiId: 170 });
        }
        return send(res, 200, { posts: fixture.sosPosts.length, connections: fixture.connections, calls: fixture.calls });
      }
      if (req.url.startsWith('/fixture-api/')) {
        const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
        fixture.calls.push({ method: req.method, endpoint });
        if (endpoint.startsWith('/auth/google/web/')) {
          if (fixture.google) return fixture.google.app(req, res);
          if (endpoint.endsWith('/status')) return send(res, 200, { linked: false });
          return send(res, 503, null, 'Google Web chưa được cấu hình trong fixture hồi quy.');
        }
        const role = { admin: 'QuanTriVien', caregiver: 'NguoiChamSoc', relative: 'NguoiThan' }[fixture.scenario] || 'NguoiCaoTuoi';
        const owner = req.headers.authorization === 'Bearer fixture-switched' ? 71 : 70;
        const user = { userId: owner, hoTen: `Tài khoản fixture ${owner}`, tenDangNhap: 'fixture.elder', soDienThoai: '0000000015', tenVaiTro: role };
        if (endpoint === '/auth/login' && req.method === 'POST') {
          let body = ''; for await (const chunk of req) body += chunk; const login = JSON.parse(body); fixture.logins.push(login);
          if (fixture.scenario === 'locked') return send(res, 403, null, 'Tài khoản đã bị khóa', 'ACCOUNT_LOCKED');
          if (login.matKhau !== 'fixture-password') return send(res, 401, null, 'Mật khẩu không chính xác', 'INVALID_CREDENTIALS');
          return send(res, 200, { token: 'fixture-elder', user });
        }
        if (endpoint === '/auth/me') return fixture.scenario === 'expired' ? send(res, 401, null, 'Hết hạn', 'TOKEN_EXPIRED') : send(res, 200, user);
        if (endpoint === '/permissions/me') return send(res, 200, ['QLHOSONCT', 'QLCHISOSK', 'QLLICHUONGTHUOC', 'QLLICHKHAM', 'QLNGUOICHAMSOC', 'QLCANHBAO'].map(maChucNang => ({ maChucNang, xem: true, sua: fixture.scenario !== 'readonly', them: fixture.scenario !== 'readonly' })));
        if (endpoint === '/care-assistant/profiles' && req.method === 'GET') return send(res, 200, [{ id: fixture.scenario === 'ai-context' ? 999 : owner + 100, hoTen: `NCT fixture ${owner}` }]);
        if (endpoint === '/care-assistant/status' && req.method === 'GET') return send(res, 200, { aiConfigured: fixture.scenario !== 'ai-unavailable', provider: 'fixture', model: 'fixture' });
        if (endpoint === '/care-assistant/chat' && req.method === 'POST') {
          let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body); (fixture.chats ||= []).push(values);
          assert.equal(values.elderlyId, owner + 100);
          assert.ok(Object.keys(values).every(key => ['question', 'elderlyId', 'history', 'conversationToken'].includes(key)));
          assert.ok(values.history.length <= 8);
          if (fixture.scenario === 'ai-expired') return send(res, 401, null, 'Token fixture hết hạn', 'TOKEN_EXPIRED');
          if (fixture.scenario === 'ai-error') return send(res, 503, null, 'Fixture unavailable');
          if (fixture.scenario === 'ai-offline') { res.destroy(); return; }
          const domain = values.question.includes('code') ? 'OUT_OF_SCOPE' : values.question.includes('thuốc hôm nay') ? 'APP' : 'HEALTH';
          const answer = { profile: { id: fixture.scenario === 'ai-owner' ? 999 : owner + 100 }, mode: domain === 'HEALTH' ? 'ai' : 'functional', domain,
            text: domain === 'OUT_OF_SCOPE' ? 'Xin lỗi, tôi chỉ hỗ trợ các câu hỏi về CareSenior và sức khỏe.' : domain === 'APP' ? 'Chưa có lịch thuốc fixture hôm nay.'
              : '**Câu trả lời AI fixture**\n- Thông tin sức khỏe trong phiên.\n' + '<img src="https://bad.invalid/track" onerror="window.fixtureInjected=true">\n[javascript](javascript:alert(1))\n' + 'Nội dung dài an toàn. '.repeat(25),
            actions: domain === 'APP' ? ['medications'] : ['sos', 'https://bad.invalid', 'confirm', '/dashboard'], conversationToken: 'fixture-signed-context', modeReason: 'fixture' };
          if (fixture.scenario === 'ai-unavailable') { answer.mode = 'functional'; answer.modeReason = 'ai_unavailable'; answer.text = 'AI hiện không khả dụng. Bạn có thể thử lại sau.'; }
          if (['ai-pending', 'ai-session'].includes(fixture.scenario)) { fixture.releaseChat = () => send(res, 200, answer); return; }
          return send(res, 200, answer);
        }
        if (role !== 'NguoiCaoTuoi' && req.method === 'GET') return send(res, 200, []);
        if (endpoint === '/elderly/me') {
          assert.equal(role, 'NguoiCaoTuoi');
          if (req.method === 'POST') {
            let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body); fixture.posts.push(values);
            fixture.completed = true;
          }
          if (fixture.scenario === 'offline') { res.destroy(); return; }
          if (fixture.scenario === 'server') return send(res, 503, null, 'Máy chủ chưa khả dụng');
          if (fixture.scenario === 'forbidden') return send(res, 403, null, 'Không có quyền');
          if (fixture.scenario === 'generic404') return send(res, 404, null, 'Không tìm thấy', 'NOT_FOUND');
          if (fixture.scenario === 'missing' && !fixture.completed) return send(res, 404, null, 'Chưa có hồ sơ', 'ELDERLY_PROFILE_NOT_FOUND');
          if (req.method === 'PUT') {
            let body = ''; for await (const chunk of req) body += chunk;
            fixture.profileUpdate = JSON.parse(body); fixture.mutations.push({ endpoint, values: fixture.profileUpdate });
            assert.equal('cccd' in fixture.profileUpdate, false); assert.equal('userId' in fixture.profileUpdate, false);
          }
          return send(res, 200, { id: owner + 100, userId: owner, hoTen: fixture.profileName || `NCT fixture ${owner}`, ngaySinh: '1950-01-01', gioiTinh: 'Nữ', soDienThoai: '0000000012', email: 'elder-fixture@example.invalid', trangThai: 'DangTheoDoi', ngayTao: '2026-10-27T06:05:00Z', ...fixture.profileUpdate });
        }
        if (endpoint === '/health-metric-types' && req.method === 'GET') {
          if (fixture.holdTypes) { (fixture.typeReplies ||= []).push(() => send(res, 200, metricTypes)); return; }
          return send(res, 200, metricTypes);
        }
        if (endpoint === '/elderly/me/caregivers' && req.method === 'GET') return send(res, 200, fixture.scenario === 'empty' ? [] : [{ id: 1, hoTen: 'Người chăm sóc fixture', laChinh: true }]);
        if (endpoint === '/elderly/me/relatives' && req.method === 'GET') {
          if (fixture.scenario !== 'own-relatives' || fixture.ownRelativesMode === 'empty') return send(res, 200, []);
          if (fixture.ownRelativesMode === 'error') return send(res, 503, null, 'Không tải được Người thân fixture');
          if (fixture.ownRelativesMode === 'denied') return send(res, 403, null, 'Đã mất quyền xem fixture');
          const scope = { hoSoCoBan: true, chiSoSucKhoe: true, lichThuoc: true, lichKham: true, canhBao: true, benhNen: true, diUng: false, ketQuaKham: false };
          return send(res, 200, [{ id: 71, nguoiCaoTuoiId: fixture.ownRelativesMode === 'foreign' ? 999 : owner + 100,
            hoTen: `Người thân fixture ${owner} với họ và tên rất dài để kiểm tra xuống dòng`, moiQuanHe: 'Con gái', soDienThoai: '0000000001', phamViChiaSe: scope },
          { id: 72, nguoiCaoTuoiId: owner + 100, hoTen: `Người thân chưa cập nhật SĐT ${owner}`, moiQuanHe: 'Cháu', soDienThoai: null,
            phamViChiaSe: { ...scope, benhNen: false } }]);
        }
        if (endpoint === '/elderly/me/health-metrics') {
          if (fixture.scenario === 'dataerror') return send(res, 503, null, 'Lỗi kết nối fixture sức khỏe');
          if (fixture.scenario === 'foreign') return send(res, 200, [{ id: 99, nguoiCaoTuoiId: 999, tenChiSo: 'KHÔNG ĐƯỢC HIỂN THỊ', giaTri: 777 }]);
          if (req.method === 'POST') {
            let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body);
            const type = metricTypes.find(row => row.id === values.loaiChiSoId);
            const error = validateMetricValues({ TenChiSo: type?.tenChiSo, DonVi: type?.donVi }, values.giaTri, values.giaTriPhu);
            if (error) return send(res, 422, null, error, 'INVALID_METRIC_VALUE');
            fixture.mutations.push({ endpoint, values });
            fixture.metrics.push({ id: 100 + fixture.metrics.length, nguoiCaoTuoiId: owner + 100, ...values, tenChiSo: type.tenChiSo, donVi: type.donVi, thoiGianDo: new Date().toISOString(), laBatThuong: false });
            return send(res, 201, fixture.metrics.at(-1));
          }
          const params = new URL(req.url, origin).searchParams;
          return send(res, 200, (fixture.scenario === 'empty' ? [] : fixture.metrics).filter(row => (!params.get('loaiChiSoId') || row.loaiChiSoId === +params.get('loaiChiSoId')) && (!params.get('tuNgay') || row.thoiGianDo.slice(0, 10) >= params.get('tuNgay')) && (!params.get('denNgay') || row.thoiGianDo.slice(0, 10) <= params.get('denNgay'))).map(row => ({ ...row, nguoiCaoTuoiId: owner + 100 })));
        }
        if (endpoint === '/elderly/me/medication-schedule' && req.method === 'GET') {
          if (fixture.scenario === 'design-home-med-error') return send(res, 503, null, 'Lịch thuốc fixture chưa khả dụng');
          const day = new URL(req.url, origin).searchParams.get('tuNgay');
          return send(res, 200, (fixture.scenario === 'empty' ? [] : fixture.doses).filter(row => row.thoiGianDuKien.slice(0, 10) === day).map(row => ({ ...row, nguoiCaoTuoiId: owner + 100 })));
        }
        if (/^\/medication-schedule\/\d+\/(confirm|supplement)$/.test(endpoint) && req.method === 'PATCH') {
          let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body);
          const row = fixture.doses.find(row => row.id === Number(endpoint.split('/')[2]));
          if (row.trangThai === 'DaUong') return send(res, 409, null, 'Liều thuốc đã thay đổi', 'DOSE_CHANGED');
          fixture.mutations.push({ endpoint, values }); row.trangThai = values.trangThai || 'DaUong'; row.thoiGianThucTe = values.thoiGianThucTe || new Date().toISOString();
          if (endpoint.endsWith('/supplement')) row.ghiNhanBoSung = { lyDo: values.lyDo };
          return send(res, 200, row);
        }
        if (endpoint.startsWith('/elderly/me/appointments') && req.method === 'GET') return send(res, 200, fixture.scenario === 'empty' ? [] : [
          { id: 1, nguoiCaoTuoiId: owner + 100, tenBenhVien: 'Cơ sở y tế fixture', thoiGianKham: '2026-10-27T23:55:00', trangThai: 'ChuaDen', lyDoKham: 'Khám định kỳ fixture', ketQuaKham: null },
          ...(endpoint.endsWith('/upcoming') ? [] : [{ id: 2, nguoiCaoTuoiId: owner + 100, tenBenhVien: 'Lịch khám lịch sử fixture', thoiGianKham: '2026-10-26T13:05:00', trangThai: 'DaKham', ketQuaKham: 'Kết quả khám fixture chỉ đọc' }]),
        ]);
        if (endpoint === '/auth/change-password' && req.method === 'POST') { fixture.passwordChanges++; return send(res, 200, null, 'Đổi mật khẩu fixture thành công'); }
        if (endpoint === '/emergency-alerts') {
          if (req.method === 'POST') {
            let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body); fixture.sosPosts.push(values);
            assert.deepEqual(Object.keys(values).sort(), values.viDo == null ? ['noiDung'] : ['kinhDo', 'noiDung', 'viDo']);
            if (fixture.scenario === 'sos-uncertain') return send(res, 503, null, 'Fixture: không xác định kết quả');
            const sos = { id: 80, nguoiCaoTuoiId: owner + 100, ngayGui: new Date().toISOString(), trangThai: 'DangGui', noiDung: values.noiDung, viDo: values.viDo, kinhDo: values.kinhDo, soNguoiChamSocNhan: 0 };
            fixture.sos.push(sos);
            if (fixture.scenario === 'sos-pending') { fixture.releaseSos = () => send(res, 201, sos); return; }
            return send(res, 201, sos);
          }
          return send(res, 200, fixture.sos.filter(row => row.nguoiCaoTuoiId === owner + 100));
        }
        if (endpoint === '/elderly/me/alerts' && req.method === 'GET') return send(res, 200, fixture.scenario === 'empty' ? [] : fixture.alerts.filter(row => row.nguoiCaoTuoiId === owner + 100));
        if (endpoint === '/notifications/me' && req.method === 'GET') return send(res, 200, fixture.scenario === 'empty' ? [] : owner === 70 ? [...fixture.notices, ...fixture.notices.filter(row => row.id === 2)] : []);
        if (/^\/notifications\/\d+\/read$/.test(endpoint) && req.method === 'PATCH') {
          const notice = fixture.notices.find(row => row.id === Number(endpoint.split('/')[2]));
          fixture.reads.push(endpoint); if (!notice || owner !== 70) return send(res, 404, null);
          notice.daDoc = true; return send(res, 200, { id: notice.id, daDoc: true });
        }
        fixture.forbidden.push(`${req.method} ${endpoint}`); return send(res, 403, null, 'API ngoài phạm vi fixture');
      }
      if (req.method !== 'GET') return send(res, 405, null);
      if (req.url === '/tab-companion') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<script>addEventListener("message",e=>{if(e.origin===location.origin&&e.data==="switch")localStorage.setItem("token","fixture-switched")});window.fixtureCompanionReady=true;parent.postMessage("fixture-companion-ready",location.origin);</script>'); return;
      }
      if (req.url.startsWith('/preview')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<html><body style="margin:0"><iframe title="NCT workspace" style="border:0;width:${fixture.width}px;height:1000px" src="/frame"></iframe>${['tabs', 'sos-account', 'ai-session', 'google-stale'].includes(fixture.scenario) ? '<iframe title="Second test browsing context" id="companion" hidden src="/tab-companion"></iframe><script>let switchPending=false;addEventListener("message",e=>{if(e.origin!==location.origin)return;if(e.data==="fixture-switch-account")switchPending=true;const other=document.getElementById("companion").contentWindow;if(switchPending&&other.fixtureCompanionReady){switchPending=false;other.postMessage("switch",location.origin)}});</script>' : ''}</body></html>`); return;
      }
      if (req.url.startsWith('/frame') || req.url === '/login' || req.url.startsWith('/ca-nhan')) {
        const entry = { scenario: fixture.scenario, width: fixture.width };
        // Synthetic token: no real issuer/signature. Only the RAM auth API
        // accepts it; exp exercises client cache erasure, not authentication.
        const roleToken = ['login', 'locked'].includes(fixture.scenario) || fixture.scenario.startsWith('google-') ? '' : fixture.scenario === 'ai-idle-expiry'
          ? `fixture-token.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 12 })).toString('base64url')}.fixture-signature` : 'fixture-elder';
        const html = await vite.transformIndexHtml(req.url, `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__ELDERLY_FIXTURE__=${JSON.stringify(entry)};${fixture.scenario.startsWith('google-') ? `window.fixtureGoogleSdk={};window.google={accounts:{id:{initialize(config){window.fixtureGoogleSdk.config=config},renderButton(el){const b=document.createElement('button');b.type='button';b.textContent='Chọn Google fixture';b.className='fixture-google-choice';b.onclick=()=>window.fixtureGoogleSdk.fire();el.appendChild(b)},cancel(){},disableAutoSelect(){}}}};window.fixtureGoogleSdk.fire=()=>{const c=window.fixtureGoogleSdk.config;const credential='synthetic:'+btoa(JSON.stringify({nonce:${fixture.scenario === 'google-invalid' ? "'wrong-nonce'" : 'c.nonce'},sub:'fixture-google-70'})).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');c.callback({credential});c.callback({credential})};` : ''}window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=clearTimeout;if(!sessionStorage.getItem('fixture-booted')){sessionStorage.setItem('fixture-booted','1');localStorage.clear();${roleToken ? `localStorage.setItem('token','${roleToken}');` : ''}history.replaceState(null,'','${roleToken ? (fixture.scenario === 'own-relatives' ? '/ca-nhan/nguoi-than' : '/ca-nhan') : '/login'}');}</script></head><body><div id="root"></div><script type="module" src="/test/fixtures/elderlyWorkspacePreview.jsx"></script></body></html>`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
      }
      vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
    } catch (error) { report = { error: error.message }; if (!res.headersSent) send(res, 500, null); }
  });
  t.after(async () => { await new Promise(resolve => io.close(resolve)); await vite.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  const evidence = process.env.CARESENIOR_ELDERLY_EVIDENCE || await mkdtemp(path.join(process.env.CARESENIOR_TEST_EVIDENCE_ROOT || os.tmpdir(), 'caresenior-elderly-web-'));
  const cases = [[360, 'phase2'], [768, 'phase2'], [1024, 'phase2'], [1440, 'phase2'], [360, 'ready'], [768, 'ready'], [1024, 'ready'], [1440, 'ready'], [360, 'missing'], [1024, 'login'], [1024, 'locked'], [360, 'large-text'],
    ...['offline', 'server', 'forbidden', 'generic404', 'expired', 'admin', 'caregiver', 'relative', 'logout', 'tabs', 'refresh', 'empty', 'dataerror', 'foreign', 'readonly', 'actions', 'large-text',
      'sos-cancel', 'sos-denied', 'sos-uncertain', 'sos-pending', 'sos-account', 'safety-live', 'ai-error', 'ai-offline', 'ai-owner', 'ai-context', 'ai-unavailable', 'ai-pending', 'ai-session', 'ai-expired', 'ai-idle-expiry'].map(scenario => [1024, scenario]),
    ...[360, 768, 1024, 1440].map(width => [width, 'ai']), ...[360, 768, 1024, 1440].map(width => [width, 'google-onboarding']),
    [1024, 'google-cancel'], [1024, 'google-invalid'], [1024, 'google-stale'], [360, 'sos-send'], [768, 'sos-gps'],
    ...['design-home', 'design-health', 'design-schedule', 'design-visits', 'design-sos', 'design-alerts', 'design-notifications', 'design-profile', 'design-ai', 'design-metric-form', 'design-large-text', 'design-metric-form-large', 'design-profile-form-large', 'design-dose-form-large'].flatMap(name => [360, 768, 1024, 1440].map(width => [width, name])),
    [1024, 'design-reduced-motion'],
    ...[360, 768, 1024, 1440, 1920].map(width => [width, 'design-home-six']),
    ...[360, 768, 1024, 1440].map(width => [width, 'design-home-six-large']),
    [1024, 'design-home-complete'], [360, 'design-home-empty'], [1024, 'design-home-med-error'],
    ...['design-header-long', 'design-header-long-large', 'own-relatives', 'nav-shortcuts'].flatMap(name => [360, 768, 1024, 1440].map(width => [width, name]))];
  const selectedCases = (process.env.CARESENIOR_ELDERLY_CASES || process.env.CARESENIOR_ELDERLY_CASE || '').split(',').filter(Boolean);
  for (const [width, scenario] of cases.filter(([, name]) => !selectedCases.length || selectedCases.includes(name))) await t.test(`${scenario} ${width}px`, { timeout: 45000 }, async () => {
    fixture = { scenario, width, calls: [], posts: [], logins: [], forbidden: [], mutations: [], passwordChanges: 0, connections: 0, sosPosts: [], sos: [], reads: [],
      alerts: [{ id: 1, nguoiCaoTuoiId: 170, loaiCanhBao: 'ChiSoBatThuong', mucDo: 'TrungBinh', trangThai: 'ChuaXuLy', noiDung: 'Cảnh báo sức khỏe fixture của tôi', ngayTao: '2026-10-27T13:05:00', ghiChuXuLy: 'INTERNAL SECRET' }],
      notices: [{ id: 1, tieuDe: 'Thông báo fixture của tôi', noiDung: 'Nhắc lịch thuốc fixture', lienKetBang: 'LichUongThuoc', lienKetId: 1, ngayTao: '2026-10-27T23:55:00', daDoc: false }],
      metrics: [
        { id: 1, loaiChiSoId: 1, tenChiSo: 'Huyết áp', giaTri: 120, giaTriPhu: 80, donVi: 'mmHg', thoiGianDo: '2026-10-27T13:05:00' },
        { id: 2, loaiChiSoId: 1, tenChiSo: 'Huyết áp', giaTri: 125, giaTriPhu: 82, donVi: 'mmHg', thoiGianDo: '2026-10-27T23:55:00' },
        { id: 3, loaiChiSoId: 2, tenChiSo: 'Nhiệt độ cơ thể', giaTri: 37.2, donVi: '°C', thoiGianDo: '2026-10-27T16:55:00Z' },
      ], doses: [
        { id: 1, tenThuoc: 'Thuốc fixture tên dài để kiểm tra hiển thị dễ đọc trên màn hình nhỏ', lieuDung: 'Theo đơn thuốc fixture', cachDung: 'Hướng dẫn fixture nhiều dòng. '.repeat(8), thoiGianDuKien: `${today()}T08:00:00`, trangThai: 'ChuaDenGio' },
        { id: 2, tenThuoc: 'Thuốc fixture đã bỏ lỡ', lieuDung: 'Theo đơn fixture', thoiGianDuKien: `${today()}T09:00:00`, trangThai: 'BoLo' },
        { id: 3, tenThuoc: 'Thuốc fixture ngày trước', lieuDung: 'Theo đơn fixture', thoiGianDuKien: `${yesterday()}T23:00:00`, trangThai: 'BoLo' },
      ] }; report = null;
    if (scenario.startsWith('design-home-six')) fixture.metrics.push(
      { id: 4, loaiChiSoId: 3, tenChiSo: 'Nhịp tim', giaTri: 100, donVi: 'lần/phút', thoiGianDo: '2026-10-27T13:05:00', laBatThuong: fixture.scenario !== 'phase2' },
      { id: 5, loaiChiSoId: 4, tenChiSo: 'Cân nặng', giaTri: 75, donVi: 'kg', thoiGianDo: '2026-10-27T13:05:00' },
      { id: 6, loaiChiSoId: 5, tenChiSo: 'SpO2', giaTri: 98, donVi: '%', thoiGianDo: '2026-10-27T13:05:00' },
      { id: 7, loaiChiSoId: 6, tenChiSo: 'Đường huyết', giaTri: 95, donVi: 'mg/dL', thoiGianDo: '2026-10-27T13:05:00' },
    );
    if (scenario.startsWith('design-header-long')) fixture.profileName = 'NCT fixture 70 Nguyễn Thị Minh An tên tài khoản dài để kiểm tra khả năng hiển thị';
    if (scenario === 'design-home-complete') fixture.doses.forEach(row => { row.trangThai = 'DaUong'; row.thoiGianThucTe = row.thoiGianDuKien; });
    if (scenario === 'design-home-empty') fixture.doses = [];
    if (scenario.startsWith('google-')) fixture.google = await createGoogleFixture({ browser: true, linked: scenario !== 'google-onboarding' });
    const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-elderly-chrome-'));
    let child, timer, errors = '';
    try {
      for (let startup = 0; startup < 2; startup++) {
        errors = '';
        child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-mode', '--disable-background-networking', `--user-data-dir=${profile}`, `--window-size=${Math.max(width + 30, 800)},1100`,
      ...(scenario === 'design-reduced-motion' ? ['--force-prefers-reduced-motion'] : []),
      '--force-device-scale-factor=1', `--virtual-time-budget=${scenario.startsWith('sos-') || ['safety-live', 'ai-idle-expiry'].includes(scenario) ? 40000 : 18000}`, `--screenshot=${path.join(evidence, `${scenario}-${width}.png`)}`, '--dump-dom', `${origin}/preview`], { windowsHide: true });
        child.stderr.on('data', data => { errors += data; }); child.stdout.resume();
        timer = setTimeout(() => child.kill(), 40000);
        let startupError;
        try {
          await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Chrome ${code} at ${fixture.progress}; API calls=${JSON.stringify(fixture.calls)}: ${errors.slice(-300)}`))); });
        } catch (error) { startupError = error; }
        clearTimeout(timer);
        // Retry only an empty browser startup. Never replay an application action,
        // SOS, account linking or a failed assertion.
        if (!report && fixture.calls.length === 0 && startup === 0) {
          t.diagnostic(`${scenario} ${width}: retry empty Chrome startup (0 application API calls)`);
          continue;
        }
        if (startupError) throw startupError;
        break;
      }
      await writeFile(path.join(evidence, `${scenario}-${width}.json`), JSON.stringify({ report, calls: fixture.calls }, null, 2));
      assert.ok(report, `No UI result: ${errors.slice(-500)}`); assert.equal(report.error, undefined, JSON.stringify(report));
      for (const check of report.checks) assert.equal(check.pass, true, check.name);
      assert.deepEqual(fixture.forbidden, [], 'Only approved own-care APIs may run; no unapproved clinical or staff writes');
      if (scenario === 'missing') { assert.equal(fixture.posts.length, 1); assert.equal(fixture.posts[0].gioiTinh, 'Nữ'); assert.equal(fixture.posts[0].ngaySinh, '1950-01-01'); }
      else assert.equal(fixture.posts.length, 0);
      for (const login of fixture.logins) assert.equal(login.platform, 'web');
      if (scenario === 'actions') {
        assert.equal(fixture.mutations.filter(row => row.endpoint === '/elderly/me/health-metrics').length, 1);
        assert.equal(fixture.mutations.filter(row => row.endpoint.endsWith('/confirm')).length, 1);
        assert.equal(fixture.mutations.filter(row => row.endpoint.endsWith('/supplement')).length, 1);
        assert.equal(fixture.mutations.filter(row => row.endpoint === '/elderly/me').length, 1);
        assert.equal(fixture.passwordChanges, 1);
      } else assert.equal(fixture.mutations.length, 0);
      if (['admin', 'caregiver', 'relative'].includes(scenario)) assert.equal(fixture.calls.some(call => call.endpoint === '/elderly/me'), false);
      if (['sos-send', 'sos-gps', 'sos-denied', 'sos-uncertain', 'sos-pending'].includes(scenario)) assert.equal(fixture.sosPosts.length, 1);
      else assert.equal(fixture.sosPosts.length, 0, 'Only an explicit completed hold may POST SOS');
      if (scenario === 'sos-gps') assert.deepEqual({ viDo: fixture.sosPosts[0].viDo, kinhDo: fixture.sosPosts[0].kinhDo }, { viDo: 10.75, kinhDo: 106.67 });
      if (scenario === 'sos-denied' || scenario === 'sos-send') assert.equal('viDo' in fixture.sosPosts[0], false);
      if (scenario === 'safety-live') assert.equal(fixture.reads.length, 1);
      else assert.equal(fixture.reads.length, 0);
      if (fixture.google) {
        assert.equal(fixture.google.state.users.length, 2, 'Google Web never inserts another account');
        if (scenario === 'google-onboarding') { assert.equal(fixture.google.state.writes, 1); assert.deepEqual(fixture.google.state.sessions, [70]); }
        else { assert.equal(fixture.google.state.writes, 0); assert.equal(fixture.google.state.sessions.length, 0); }
      }
      await writeFile(path.join(evidence, `${scenario}-${width}.json`), JSON.stringify({ ...report, calls: fixture.calls }, null, 2));
    } finally {
      clearTimeout(timer); if (child.exitCode === null) child.kill();
      const relative = path.relative(os.tmpdir(), profile);
      if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('caresenior-elderly-chrome-')) await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    }
  });
  t.diagnostic(`Isolated Chrome evidence: ${evidence}`);
});
