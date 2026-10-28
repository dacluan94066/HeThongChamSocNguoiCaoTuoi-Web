import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Server } = createRequire(path.join(root, '../server/package.json'))('socket.io');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn) { for (let i = 0; i < 200; i++) { try { const result = await fn(); if (result) return result; } catch { /* Browser is starting. */ } await pause(40); } throw Error('Browser startup timeout'); }
async function connectCdp(profile) {
  const port = await waitFor(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  const page = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'));
  const socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const result = JSON.parse(event.data); const entry = pending.get(result.id); if (entry) { pending.delete(result.id); clearTimeout(entry.timer); if (result.error) entry.reject(Error(JSON.stringify(result.error))); else entry.resolve(result.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout ${method}`)); }, 30000);
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }));
  });
  return { call, close: () => socket.close(), async evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  } };
}

test('notification modal: real headless Chrome + RAM HTTP/Socket.IO, no SQL or live SOS', { skip: !existsSync(chrome), timeout: 240000 }, async t => {
  let fixture;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
    cacheDir: await mkdtemp(path.join(os.tmpdir(), 'caresenior-notification-cache-')),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin), 'import.meta.env.VITE_USE_MOCK': 'false' },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const io = new Server(server); io.use((socket, next) => String(socket.handshake.auth?.token).startsWith('notification-fixture') ? next() : next(Error('FIXTURE_ONLY')));
  const send = (res, status, data, message = 'Fixture RAM') => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, message })); };
  server.on('request', async (req, res) => {
    if (req.url.startsWith('/socket.io')) return;
    if (req.url === '/__state') return send(res, 200, fixture);
    if (req.url === '/__control') {
      let body = ''; for await (const chunk of req) body += chunk; const { action } = JSON.parse(body);
      if (action === 'foreign') io.emit('thongbao:new', { id: 999, userId: 999, noiDung: 'FOREIGN PRIVATE' });
      if (action === 'new') { fixture.records.push({ id: 22, userId: 70, tieuDe: 'Thông báo realtime mới', noiDung: 'Nội dung tài khoản A mới', ngayTao: '2026-10-28T14:05:00', daDoc: false }); for (let i = 0; i < 8; i++) io.emit('thongbao:new', { id: 22 }); }
      if (action === 'read-error') fixture.readError = true;
      if (action === 'recover') fixture.mode = 'ready';
      if (action === 'visual') for (const item of fixture.records) item.noiDung = item.noiDung.replace('<script>window.__noticeInjected=true</script>', '');
      if (action === 'hold') fixture.hold = true;
      if (action === 'invalidate') io.emit('thongbao:new', { id: 1000 });
      if (action === 'release') { fixture.hold = false; fixture.release?.(); }
      if (action === 'sos') io.emit('canhbao:new', { id: 800, canhBaoId: 800, canhBaoKhanCapId: 801, nguonBang: 'CanhBaoKhanCap', nguonId: 801, nguoiCaoTuoiTen: 'SOS fixture', ngayGui: new Date().toISOString(), trangThai: 'CHUA_XU_LY', moTa: 'SOS RAM only' });
      return send(res, 200, null);
    }
    if (req.url.startsWith('/fixture-api/')) {
      const b = req.headers.authorization === 'Bearer notification-fixture-b';
      if (!b && req.headers.authorization !== 'Bearer notification-fixture') return send(res, 401, null);
      const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
      if (endpoint === '/auth/me') return send(res, 200, { userId: b ? 71 : 70, hoTen: b ? 'Fixture B' : 'Fixture A', tenVaiTro: b ? 'QuanTriVien' : fixture.role });
      if (endpoint === '/permissions/me') return send(res, 200, ['QLCANHBAO', 'QLHOSONCT', 'QLLICHKHAM', 'QLLICHUONGTHUOC'].map(maChucNang => ({ maChucNang, xem: true })));
      if (endpoint === '/alerts') return send(res, 200, [{ id: 800, loaiCanhBao: 'KhanCap', mucDo: 'KhanCap', trangThai: 'ChuaXuLy' }]);
      if (endpoint === '/notifications/me' && req.method === 'GET') {
        fixture.reads++;
        if (fixture.mode === 'error') return send(res, 503, null, 'Fixture offline');
        const records = b ? [{ id: 501, userId: 71, tieuDe: 'Thông báo tài khoản B', noiDung: 'Chỉ B được xem', ngayTao: '2026-10-28T13:05:00', daDoc: false }] : fixture.mode === 'empty' ? [] : structuredClone([...fixture.records, fixture.records[0]]);
        if (fixture.hold && !b) await new Promise(resolve => { fixture.release = resolve; });
        return send(res, 200, records);
      }
      if (/^\/notifications\/\d+\/read$/.test(endpoint) && req.method === 'PATCH') {
        const id = Number(endpoint.split('/')[2]); fixture.patches.push(id);
        if (fixture.readError) return send(res, 503, null, 'Fixture read unavailable');
        const row = fixture.records.find(item => item.id === id); if (!row) return send(res, 404, null);
        row.daDoc = true; return send(res, 200, { id, daDoc: true });
      }
      fixture.unexpected.push(`${req.method} ${endpoint}`); return send(res, 403, null);
    }
    if (req.url.startsWith('/preview')) {
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>localStorage.clear();localStorage.setItem("token","notification-fixture");</script></head><body><div id="root"></div><script type="module" src="/test/fixtures/notificationCenterPreview.jsx"></script></body></html>')); return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  t.after(async () => { fixture.release?.(); await new Promise(resolve => io.close(resolve)); await vite.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  const evidence = process.env.CARESENIOR_NOTIFICATION_EVIDENCE || await mkdtemp(path.join(os.tmpdir(), 'caresenior-notification-evidence-')); await mkdir(evidence, { recursive: true });
  for (const [width, role, large, mode = 'ready'] of [[360, 'QuanTriVien'], [768, 'NguoiChamSoc'], [1024, 'QuanTriVien'], [1440, 'NguoiChamSoc'], [360, 'QuanTriVien', true], [1024, 'NguoiThan'], [1024, 'NguoiCaoTuoi'], [360, 'QuanTriVien', false, 'empty'], [1024, 'NguoiChamSoc', false, 'error'], [768, 'QuanTriVien', false, 'loading']]) {
    await t.test(`${role} ${width}px ${mode}${large ? ' text 1.8 fixture' : ''}`, async () => {
      fixture = { role, mode, hold: mode === 'loading', reads: 0, patches: [], unexpected: [], records: Array.from({ length: 21 }, (_, i) => ({ id: i + 1, userId: 70,
        tieuDe: i === 20 ? 'Cập nhật sức khỏe và lịch chăm sóc mới dành cho bạn' : `Thông báo chăm sóc số ${i + 1}`,
        noiDung: 'Nội dung tài khoản A. ' + 'Thông tin chi tiết được hiển thị đầy đủ để bạn theo dõi và phối hợp chăm sóc. '.repeat(3) + '<script>window.__noticeInjected=true</script>',
        loaiThongBao: ['NhacThuoc', 'NhacLichKham', 'CanhBaoChiSo', 'KhanCap'][i % 4], lienKetBang: i === 20 ? 'CanhBaoKhanCap' : 'LichKhamBenh', lienKetId: i + 1,
        ngayTao: i === 20 ? '2026-10-28T13:05:00' : `2026-10-28T12:${String(i).padStart(2, '0')}:00`, daDoc: i === 19 })) };
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-notification-browser-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, `--window-size=${width},960`, 'about:blank'], { windowsHide: true });
      child.stdout.resume(); child.stderr.resume(); let cdp;
      try {
        cdp = await connectCdp(profile); await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 576 });
        await cdp.call('Page.navigate', { url: `${origin}/preview${large ? '?large=1' : ''}` });
        await waitFor(() => cdp.evaluate('window.notificationFixtureReady'));
        const metrics = await cdp.evaluate('window.prepareNotifications()');
        if (!metrics.separateRole) {
          const image = await cdp.call('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(evidence, `modal-${width}-${mode}${large ? '-large' : ''}.png`), Buffer.from(image.data, 'base64'));
          for (let i = 0; i < 26; i++) {
            await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            assert.equal(await cdp.evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'), true,
              `Actual keyboard Tab ${i} stays inside modal: ${await cdp.evaluate('document.activeElement.outerHTML.slice(0, 500)')}`);
          }
          for (let i = 0; i < 6; i++) {
            await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
            await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
            assert.equal(await cdp.evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'), true, 'Shift+Tab remains trapped');
          }
          await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await cdp.evaluate('window.checkClosedNotifications()');
          if (width >= 576) {
            await cdp.evaluate('document.querySelector(".header-notification-button").click()'); await pause(120);
            await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 6, y: 6, button: 'left', clickCount: 1 });
            await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 6, y: 6, button: 'left', clickCount: 1 });
            await cdp.evaluate('window.checkClosedNotifications()');
          }
          if (!metrics.empty) { const result = await cdp.evaluate('window.runNotificationActions()'); assert.equal(result.pass, true); }
        }
        assert.deepEqual(fixture.unexpected, []);
      } finally { fixture.release?.(); cdp?.close(); child.kill(); await pause(100); }
    });
  }
  t.diagnostic(`Chrome screenshots: ${evidence}`);
});
