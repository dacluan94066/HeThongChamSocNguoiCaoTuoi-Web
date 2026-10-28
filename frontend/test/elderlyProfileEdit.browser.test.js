import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Server } = createRequire(path.join(root, '../server/package.json'))('socket.io');
const chrome = process.env.CARESENIOR_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('elderly profile edit preserves existing fields under StrictMode: Chrome RAM API', {
  skip: !existsSync(chrome), timeout: 120000,
}, async t => {
  let fixture, report;
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({
    root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
    cacheDir: await mkdtemp(path.join(os.tmpdir(), 'caresenior-profile-edit-cache-')),
    define: {
      'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'),
      'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin),
    },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const io = new Server(server);
  io.use((socket, next) => socket.handshake.auth?.token === 'profile-edit-fixture'
    ? next() : next(new Error('FIXTURE_ONLY')));
  const send = (res, status, data, message = 'Fixture RAM', errorCode) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: status < 400, data, message, errorCode }));
  };
  server.on('request', async (req, res) => {
    if (req.url.startsWith('/socket.io')) return;
    if (req.url === '/__result') {
      let body = ''; for await (const chunk of req) body += chunk;
      report = JSON.parse(body); return send(res, 200, null);
    }
    if (req.url === '/__state') return send(res, 200, fixture);
    if (req.url.startsWith('/fixture-api/')) {
      if (req.headers.authorization !== 'Bearer profile-edit-fixture') return send(res, 401, null);
      const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
      if (endpoint === '/auth/me') return send(res, 200, { userId: 70, hoTen: 'Fixture', tenVaiTro: fixture.role });
      if (endpoint === '/permissions/me') return send(res, 200, [{ maChucNang: 'QLHOSONCT', xem: true, sua: true }]);
      if (endpoint === '/elderly' && req.method === 'GET') {
        fixture.reads++;
        return send(res, 200, fixture.records);
      }
      if (/^\/elderly\/20[12]$/.test(endpoint) && req.method === 'PUT') {
        let body = ''; for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body);
        fixture.writes.push({ id: Number(endpoint.split('/').at(-1)), payload });
        if (payload.hoTen === 'NCT fixture A cập nhật' && !fixture.rejected) {
          fixture.rejected = true;
          return send(res, 422, null, 'Không thể lưu hồ sơ fixture, vui lòng thử lại.', 'FIXTURE_REJECTED');
        }
        const record = fixture.records.find(item => item.id === Number(endpoint.split('/').at(-1)));
        Object.assign(record, payload);
        return send(res, 200, { id: record.id });
      }
      fixture.unexpected.push(`${req.method} ${endpoint}`);
      return send(res, 403, null, 'Unexpected fixture request');
    }
    if (req.url === '/preview') {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>localStorage.clear();localStorage.setItem("token","profile-edit-fixture");</script></head><body style="margin:0;padding:12px"><div id="root"></div><script type="module" src="/test/fixtures/elderlyProfileEditPreview.jsx"></script></body></html>'));
      return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  t.after(async () => {
    await new Promise(resolve => io.close(resolve));
    await vite.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });

  for (const role of ['QuanTriVien', 'NguoiChamSoc']) {
    await t.test(role, async () => {
      fixture = {
        role, reads: 0, writes: [], rejected: false, unexpected: [],
        records: [
          { id: 201, userId: 301, tenDangNhap: 'fixture.a', hoTen: 'NCT fixture A', ngaySinh: '1950-05-28', gioiTinh: 'Nam',
            cccd: '000000000001', soDienThoai: '0000000001', diaChi: 'Địa chỉ fixture A', nhomMau: 'O+',
            benhNen: 'Bệnh nền fixture A', diUng: 'Dị ứng fixture A', trangThai: 'DangTheoDoi' },
          { id: 202, userId: 302, tenDangNhap: 'fixture.b', hoTen: 'NCT fixture B', ngaySinh: '1955-06-29', gioiTinh: 'Nữ',
            cccd: null, soDienThoai: null, diaChi: null, nhomMau: null, benhNen: null, diUng: null, trangThai: 'DangTheoDoi' },
        ],
      };
      report = null;
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-profile-edit-browser-'));
      const child = spawn(chrome, [
        '--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
        `--user-data-dir=${profile}`, '--window-size=1024,1000', '--virtual-time-budget=20000', '--dump-dom', `${origin}/preview`,
      ], { windowsHide: true });
      child.stdout.resume(); child.stderr.resume();
      const timer = setTimeout(() => child.kill(), 40000);
      try {
        await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`)));
        });
        assert.ok(report, 'Chrome must return actual UI observations');
        assert.equal(report.error, undefined, JSON.stringify(report));
        assert.equal(report.pass, true);
        assert.deepEqual(fixture.unexpected, []);
        assert.equal(fixture.writes.length, 3, 'One B save, one rejected A save, one explicit A retry');
        assert.equal(fixture.reads >= 3, true);
        const saved = fixture.writes.at(-1).payload;
        assert.equal(saved.ngaySinh, '1950-05-28');
        assert.equal(saved.gioiTinh, 'Nam');
        assert.equal(saved.cccd, '000000000001');
        assert.equal(saved.diaChi, 'Địa chỉ fixture A');
        assert.equal(saved.nhomMau, 'O+');
        assert.deepEqual(saved.benhNen, ['Bệnh nền fixture A']);
        assert.deepEqual(saved.diUng, ['Dị ứng fixture A']);
        assert.equal(fixture.writes[0].payload.cccd || '', '');
        assert.equal(fixture.writes[0].payload.diaChi || '', '');
        assert.deepEqual(fixture.writes[0].payload.benhNen, []);
        assert.deepEqual(fixture.writes[0].payload.diUng, []);
      } finally {
        clearTimeout(timer);
        if (child.exitCode === null) child.kill();
      }
    });
  }
});
