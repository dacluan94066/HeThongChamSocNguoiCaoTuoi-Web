import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn) { for (let i = 0; i < 200; i++) { try { const value = await fn(); if (value) return value; } catch { /* Startup only. */ } await pause(40); } throw Error('Chrome startup timeout'); }
async function connect(profile) {
  const port = await waitFor(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  const page = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'));
  const socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data), request = pending.get(data.id); if (request) { pending.delete(data.id); clearTimeout(request.timer); if (data.error) request.reject(Error(JSON.stringify(data.error))); else request.resolve(data.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout ${method}`)); }, 30000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); });
  return { call, close: () => socket.close(), async evaluate(expression) { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result?.value; } };
}

test('public registration for NCT/caregiver/relative: isolated headless Chrome + RAM API only', { skip: !existsSync(chrome), timeout: 180000 }, async t => {
  let fixture;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()], cacheDir: await mkdtemp(path.join(os.tmpdir(), 'caresenior-registration-cache-')),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const send = (res, status, data, message = 'Fixture RAM', errorCode) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, message, errorCode })); };
  server.on('request', async (req, res) => {
    if (req.url === '/__state') return send(res, 200, fixture);
    if (req.url === '/__control') {
      let body = ''; for await (const chunk of req) body += chunk; const { action } = JSON.parse(body);
      if (action === 'hold') fixture.hold = true;
      if (action === 'release') { fixture.hold = false; fixture.release?.(); }
      if (['duplicate', 'normal', 'network'].includes(action)) fixture.mode = action;
      return send(res, 200, null);
    }
    if (req.url.startsWith('/fixture-api/')) {
      const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
      if (endpoint === '/auth/google/web/config') return send(res, 200, { enabled: false, clientId: '' });
      if (['/auth/register', '/auth/register-caregiver', '/auth/register-relative'].includes(endpoint) && req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk; const values = JSON.parse(body); fixture.requests.push({ endpoint, body: values });
        if (fixture.hold) await new Promise(resolve => { fixture.release = resolve; });
        if (fixture.mode === 'duplicate') return send(res, 409, null, 'Email đã được sử dụng', 'EMAIL_TAKEN');
        // Drop a response after headers arrive. A pre-header socket reset can be
        // transparently retransmitted by Chrome itself before the app observes an error.
        if (fixture.mode === 'network') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders(); res.write('{'); setTimeout(() => req.socket.destroy(), 20); return; }
        const role = endpoint.endsWith('register-relative') ? 'NguoiThan' : endpoint.endsWith('register-caregiver') ? 'NguoiChamSoc' : 'NguoiCaoTuoi';
        return send(res, 201, role === 'NguoiChamSoc' ? null : { userId: 751, loaiTaiKhoan: role, ...(role === 'NguoiCaoTuoi' ? { nguoiCaoTuoiId: 851 } : {}) });
      }
      fixture.unexpected.push(`${req.method} ${endpoint}`); return send(res, 403, null);
    }
    if (req.url === '/preview') {
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>localStorage.clear();</script></head><body><div id="root"></div><script type="module" src="/test/fixtures/publicRegistrationPreview.jsx"></script></body></html>')); return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  t.after(async () => { fixture.release?.(); await vite.close(); await new Promise(resolve => server.close(resolve)); });
  const evidence = process.env.CARESENIOR_REGISTRATION_EVIDENCE || await mkdtemp(path.join(os.tmpdir(), 'caresenior-registration-evidence-')); await mkdir(evidence, { recursive: true });
  for (const width of [360, 768, 1024, 1440]) {
    await t.test(`${width}px: three roles, validation, type reset, duplicate click, errors and no implicit session`, async () => {
      fixture = { requests: [], unexpected: [], hold: false, mode: 'normal' };
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-registration-browser-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
      child.stdout.resume(); child.stderr.resume(); let cdp;
      try {
        cdp = await connect(profile); await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 576 });
        await cdp.call('Page.navigate', { url: `${origin}/preview` }); await waitFor(() => cdp.evaluate('window.registrationFixtureReady'));
        await cdp.evaluate('window.prepareRegistration()');
        const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(evidence, `registration-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        const result = await cdp.evaluate('window.runRegistrationFixture()'); assert.equal(result.pass, true); assert.deepEqual(fixture.unexpected, []);
        assert.equal(fixture.requests.length, 6);
        assert.equal(fixture.requests[0].endpoint, '/auth/register'); assert.equal(fixture.requests[0].body.ngaySinh, '1950-05-28'); assert.equal(fixture.requests[0].body.gioiTinh, 'Nam');
        assert.equal(fixture.requests[1].endpoint, '/auth/register-caregiver'); assert.equal(fixture.requests[2].endpoint, '/auth/register-relative');
        for (const request of fixture.requests.slice(1)) assert.equal('ngaySinh' in request.body || 'gioiTinh' in request.body || 'loaiTaiKhoan' in request.body || 'xacNhanMatKhau' in request.body, false);
      } finally { fixture.release?.(); cdp?.close(); child.kill(); await pause(100); }
    });
  }
  t.diagnostic(`Registration screenshots: ${evidence}`);
});
