import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Server } = createRequire(path.join(root, '../server/package.json'))('socket.io');
const chrome = process.env.CARESENIOR_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('appointment conflict refreshes Admin/caregiver UI without replay: Chrome RAM fixture', { skip: !existsSync(chrome), timeout: 60000 }, async t => {
  let fixture, report;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const io = new Server(server);
  const send = (res, status, data, errorCode, message = 'Fixture') => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, errorCode, message })); };
  server.on('request', async (req, res) => {
    if (req.url.startsWith('/socket.io')) return;
    if (req.url === '/__result') { let body = ''; for await (const chunk of req) body += chunk; report = JSON.parse(body); return send(res, 200, null); }
    if (req.url === '/__state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture)); return; }
    if (req.url.startsWith('/fixture-api/')) {
      if (req.headers.authorization !== 'Bearer appointment-conflict-fixture') return send(res, 401, null);
      const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
      if (endpoint === '/auth/me') return send(res, 200, { userId: 70, hoTen: 'Fixture', tenVaiTro: fixture.role });
      if (endpoint === '/permissions/me') return send(res, 200, [{ maChucNang: 'QLLICHKHAM', xem: true, them: true, sua: true, xoa: true }]);
      if (endpoint === '/elderly') return send(res, 200, [{ id: 1, hoTen: 'NCT fixture' }]);
      if (endpoint === '/appointments' && req.method === 'GET') {
        if (fixture.writes) fixture.readsAfterConflict++;
        return send(res, 200, [{ id: 44, nguoiCaoTuoiId: 1, nguoiCaoTuoiTen: 'NCT fixture', ngayKham: fixture.day,
          gioKham: '08:00', noiKham: 'Cơ sở fixture', trangThai: fixture.writes ? 'HUY' : 'CHUA_DEN' }]);
      }
      if (endpoint === '/appointments/44' && req.method === 'PUT') {
        fixture.writes++; return send(res, 409, null, 'APPOINTMENT_CHANGED', 'Lịch khám đã được cập nhật từ phiên hoặc thiết bị khác. Vui lòng tải lại trước khi sửa.');
      }
      fixture.unexpected.push(`${req.method} ${endpoint}`); return send(res, 403, null);
    }
    if (req.url === '/preview') {
      const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>localStorage.clear();localStorage.setItem("token","appointment-conflict-fixture");</script></head><body style="margin:0;padding:12px"><div id="root"></div><script type="module" src="/test/fixtures/appointmentConflictPreview.jsx"></script></body></html>');
      res.setHeader('Content-Type', 'text/html'); res.end(html); return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  t.after(async () => { await new Promise(resolve => io.close(resolve)); await vite.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  for (const [width, role] of [[360, 'QuanTriVien'], [1024, 'NguoiChamSoc']]) {
    await t.test(`${role} ${width}px`, async () => {
      fixture = { role, writes: 0, readsAfterConflict: 0, unexpected: [], day: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }; report = null;
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-appointment-profile-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
        `--user-data-dir=${profile}`, `--window-size=${width},1100`, '--virtual-time-budget=12000', '--dump-dom', `${origin}/preview`], { windowsHide: true });
      child.stdout.resume(); child.stderr.resume(); const timer = setTimeout(() => child.kill(), 20000);
      try {
        await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Chrome exit ${code}`))); });
        assert.ok(report); assert.equal(report.error, undefined, JSON.stringify(report)); assert.equal(report.pass, true); assert.deepEqual(fixture.unexpected, []);
      } finally {
        clearTimeout(timer); if (child.exitCode === null) child.kill();
        const relative = path.relative(os.tmpdir(), profile);
        if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('caresenior-appointment-profile-')) await rm(profile, { recursive: true, force: true, maxRetries: 3 });
      }
    });
  }
});
