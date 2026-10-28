import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Server } = createRequire(path.join(root, '../server/package.json'))('socket.io');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn) { for (let i = 0; i < 200; i++) { try { const value = await fn(); if (value) return value; } catch { /* Chrome startup. */ } await pause(40); } throw Error('Chrome startup timeout'); }
async function connect(profile) {
  const port = await wait(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  const page = await wait(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'));
  const socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data), item = pending.get(data.id); if (item) { pending.delete(data.id); clearTimeout(item.timer); if (data.error) item.reject(Error(JSON.stringify(data.error))); else item.resolve(data.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => reject(Error(`CDP timeout ${method}`)), 30000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); });
  return { call, close: () => socket.close(), async evaluate(expression) { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; } };
}
test('linked relative contact picker: real Chrome UI with isolated RAM API, no SQL or production server', { skip: !existsSync(chrome), timeout: 180000 }, async t => {
  let fixture;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()], cacheDir: await mkdtemp(path.join(os.tmpdir(), 'contact-picker-cache-')),
    define: { 'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'), 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const io = new Server(server);
  io.use((socket, next) => socket.handshake.auth?.token === 'contacts-fixture' ? next() : next(Error('FIXTURE_ONLY')));
  const send = (res, status, data, message = 'RAM fixture', errorCode) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, message, errorCode })); };
  server.on('request', async (req, res) => {
    if (req.url.startsWith('/socket.io')) return;
    if (req.url === '/__state') return send(res, 200, fixture);
    if (req.url === '/__control') { let body = ''; for await (const chunk of req) body += chunk; fixture.mode = JSON.parse(body).mode; return send(res, 200, null); }
    if (req.url.startsWith('/fixture-api/')) {
      if (req.headers.authorization !== 'Bearer contacts-fixture') return send(res, 401, null);
      const url = new URL(req.url, origin), endpoint = url.pathname.slice('/fixture-api'.length), elderlyId = Number(url.searchParams.get('nguoiCaoTuoiId'));
      if (endpoint === '/auth/me') return send(res, 200, { userId: 70, hoTen: 'Tài khoản fixture', tenVaiTro: fixture.role });
      if (endpoint === '/permissions/me') return send(res, 200, [{ maChucNang: 'QLLIENHEKC', xem: true, them: true, sua: true, xoa: true }]);
      if (endpoint === '/elderly') return send(res, 200, [{ id: 201, hoTen: 'NCT fixture A' }, { id: 202, hoTen: 'NCT fixture B' }]);
      if (endpoint === '/emergency-contacts/linked-relatives' && req.method === 'GET') {
        fixture.reads.push(elderlyId);
        if (fixture.mode === 'error') return send(res, 503, null, 'Người thân fixture chưa sẵn sàng');
        if (fixture.mode === 'slow' && elderlyId === 201) await pause(350);
        return send(res, 200, elderlyId === 201 ? [
          { id: 71, hoTen: 'Người thân fixture A', moiQuanHe: 'Con gái', soDienThoai: '0000000001', email: 'a@example.invalid' },
          { id: 72, hoTen: 'Người thân thiếu SĐT', moiQuanHe: 'Cháu', soDienThoai: null, email: null },
        ] : []);
      }
      if (endpoint === '/emergency-contacts' && req.method === 'GET') return send(res, 200, fixture.contacts.filter(row => row.nguoiCaoTuoiId === elderlyId));
      if (endpoint === '/emergency-contacts' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body);
        fixture.writes.push(values); const id = fixture.contacts.length + 1; fixture.contacts.push({ id, ...values }); return send(res, 201, { id });
      }
      fixture.unexpected.push(`${req.method} ${endpoint}`); return send(res, 403, null);
    }
    if (req.url === '/preview') {
      res.setHeader('Content-Type', 'text/html'); return res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>localStorage.clear();localStorage.setItem("token","contacts-fixture");</script></head><body><div id="root"></div><script type="module" src="/test/fixtures/emergencyContactRelativesPreview.jsx"></script></body></html>'));
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  t.after(async () => { await new Promise(resolve => io.close(resolve)); await vite.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  const evidence = process.env.CARESENIOR_CONTACT_EVIDENCE || await mkdtemp(path.join(os.tmpdir(), 'contact-picker-evidence-')); await mkdir(evidence, { recursive: true });
  for (const [width, role] of [[360, 'NguoiChamSoc'], [768, 'QuanTriVien'], [1024, 'NguoiChamSoc'], [1440, 'QuanTriVien']]) {
    await t.test(`${width}px ${role}: copy, explicit save, no phone, manual fallback, stale response and large text`, async () => {
      fixture = { role, mode: 'normal', reads: [], writes: [], contacts: [], unexpected: [] };
      const profile = await mkdtemp(path.join(os.tmpdir(), 'contact-picker-browser-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true }); child.stdout.resume(); child.stderr.resume(); let cdp;
      try {
        cdp = await connect(profile); await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 576 });
        await cdp.call('Page.navigate', { url: `${origin}/preview` }); await wait(() => cdp.evaluate('window.contactsFixtureReady'));
        await cdp.evaluate('window.prepareContacts()');
        const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(evidence, `contact-picker-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        assert.equal((await cdp.evaluate('window.runContacts()')).pass, true);
        assert.deepEqual(fixture.unexpected, []); assert.equal(fixture.writes.length, 3);
        assert.equal(fixture.writes[0].hoTen, 'Người thân fixture A'); assert.equal(fixture.writes[0].uuTien, 1);
        assert.equal(fixture.writes[1].soDienThoai, '0000000003'); assert.equal(fixture.writes[2].uuTien, 3);
        for (const values of fixture.writes) {
          assert.equal(values.nguoiCaoTuoiId, 201);
          assert.equal('nguoiThanUserId' in values || 'lienKetId' in values || 'dongYChiaSe' in values, false);
        }
      } finally { cdp?.close(); child.kill(); await pause(100); }
    });
  }
  t.diagnostic(`Screenshots: ${evidence}`);
});
