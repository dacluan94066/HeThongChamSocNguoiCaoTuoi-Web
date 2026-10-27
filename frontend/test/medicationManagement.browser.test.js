import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Server } = createRequire(path.join(root, '../server/package.json'))('socket.io');
const chrome = process.env.CARESENIOR_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('Admin/caregiver medication UI: isolated Chrome with RAM API, no SQL/.env', { skip: !existsSync(chrome), timeout: 140000 }, async t => {
  let fixture, report;
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/fixture-api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin), 'import.meta.env.VITE_USE_MOCK': 'false' },
    server: { middlewareMode: true, hmr: false, ws: false } });
  const io = new Server(server); io.use((socket, next) => socket.handshake.auth?.token === 'fixture-medication-ui' ? next() : next(Error('FIXTURE_ONLY')));
  const send = (res, status, data, errorCode, message = 'Fixture RAM') => {
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: status < 400, data, errorCode, message }));
  };
  server.on('request', async (req, res) => {
    try {
      if (req.url.startsWith('/socket.io')) return;
      if (req.url === '/__result') { let body = ''; for await (const chunk of req) body += chunk; report = JSON.parse(body); return send(res, 200, null); }
      if (req.url === '/__control') {
        let body = ''; for await (const chunk of req) body += chunk;
        if (JSON.parse(body).action === 'external-update') {
          fixture.doses[1] = { ...fixture.doses[1], trangThaiHom_nay: 'DA_UONG', thoiGianThucTe: `${fixture.today}T23:55:00` };
          io.emit('lichuongthuoc:updated', { id: 2, trangThaiDb: 'DaUong' });
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ patches: fixture.patches, readsAfterWrite: fixture.readsAfterWrite })); return;
      }
      if (req.url.startsWith('/fixture-api')) {
        const endpoint = req.url.slice('/fixture-api'.length).split('?')[0];
        if (req.headers.authorization !== 'Bearer fixture-medication-ui') return send(res, 401, null);
        fixture.calls.push({ method: req.method, endpoint });
        if (endpoint === '/auth/me') return send(res, 200, { userId: 70, hoTen: 'Fixture quản lý thuốc', tenVaiTro: fixture.role });
        if (endpoint === '/permissions/me') return send(res, 200, ['QLLICHUONGTHUOC', 'QLTHUOC'].map(maChucNang => ({ maChucNang, xem: true, sua: fixture.scenario !== 'readonly', them: false })));
        if (endpoint === '/elderly') return send(res, 200, [{ id: 1, hoTen: 'NCT fixture', trangThai: 'DangTheoDoi' }]);
        if (endpoint === '/medications') return send(res, 200, []);
        if (endpoint === '/medication-schedules' && req.method === 'GET') {
          if (fixture.patches) fixture.readsAfterWrite++;
          return send(res, 200, fixture.doses);
        }
        if (endpoint === '/medication-schedules/2/status' && req.method === 'PATCH') {
          let body = ''; for await (const chunk of req) body += chunk; fixture.patches++; fixture.bodies.push(JSON.parse(body));
          if (fixture.scenario.startsWith('conflict')) {
            fixture.doses[1] = { ...fixture.doses[1], trangThaiHom_nay: 'DA_UONG', thoiGianThucTe: `${fixture.today}T23:55:00` };
            return send(res, 409, null, 'DOSE_CHANGED', 'Original backend conflict message');
          }
          if (fixture.scenario === 'server-error' || fixture.scenario === 'other-conflict') return send(res, fixture.scenario === 'server-error' ? 503 : 409, null, 'OTHER_ERROR', 'Fixture API error');
          assert.equal(fixture.scenario, 'success');
          fixture.doses[1].trangThaiHom_nay = 'BO_LO'; return send(res, 200, { id: 2, trangThai: 'BO_LO', trangThaiDb: 'BoLo' });
        }
        fixture.unexpected.push(`${req.method} ${endpoint}`); return send(res, 403, null);
      }
      if (req.url === '/preview') {
        res.setHeader('Content-Type', 'text/html'); res.end(`<body style="margin:0"><iframe title="Medication UI" style="width:${fixture.width}px;height:1100px;border:0" src="/frame"></iframe></body>`); return;
      }
      if (req.url === '/frame') {
        const html = await vite.transformIndexHtml(req.url, `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__MEDICATION_FIXTURE__=${JSON.stringify({ scenario: fixture.scenario, width: fixture.width })};localStorage.clear();localStorage.setItem('token','fixture-medication-ui');window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),16);window.cancelAnimationFrame=clearTimeout;</script></head><body style="margin:0;padding:12px"><div id="root"></div><script type="module" src="/test/fixtures/medicationManagementPreview.jsx"></script></body></html>`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
      }
      vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
    } catch (error) { report = { error: error.message }; if (!res.headersSent) send(res, 500, null); }
  });
  t.after(async () => { await new Promise(resolve => io.close(resolve)); await vite.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
  const evidence = process.env.CARESENIOR_MEDICATION_UI_EVIDENCE || await mkdtemp(path.join(os.tmpdir(), 'caresenior-medication-ui-chrome-'));
  for (const [width, role, scenario] of [[360, 'QuanTriVien', 'ready'], [768, 'NguoiChamSoc', 'ready'], [1024, 'QuanTriVien', 'conflict'], [1440, 'NguoiChamSoc', 'conflict-missed'],
    [1024, 'NguoiChamSoc', 'success'], [1024, 'NguoiChamSoc', 'readonly'], [1024, 'QuanTriVien', 'server-error'], [1024, 'QuanTriVien', 'other-conflict'], [360, 'NguoiChamSoc', 'large-text'], [1024, 'NguoiChamSoc', 'realtime-detail']]) {
    await t.test(`${role} ${scenario} ${width}px`, { timeout: 25000 }, async () => {
      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), yesterday = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
      fixture = { role, scenario, width, today, patches: 0, readsAfterWrite: 0, bodies: [], unexpected: [], calls: [], doses:
        ['DA_UONG', 'CHUA_DEN_GIO', 'BO_LO', 'TU_CHOI', 'BO_LO', 'DA_UONG'].map((status, i) => ({ id: i + 1, nguoiCaoTuoiId: 1, nguoiCaoTuoiTen: 'NCT fixture', tenThuoc: `Thuốc fixture ${i + 1}`, lieuDung: 'Theo đơn fixture',
          thoiGianDuKien: `${i === 4 ? yesterday : today}T08:00:00`, trangThaiHom_nay: status, thoiGianThucTe: i === 0 ? `${today}T13:05:00` : null, nguoiXacNhanTen: null })) };
      report = null;
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-medication-ui-profile-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', `--user-data-dir=${profile}`,
        `--window-size=${Math.max(800, width + 30)},1200`, '--virtual-time-budget=16000', '--force-device-scale-factor=1', `--screenshot=${path.join(evidence, `${scenario}-${width}.png`)}`, '--dump-dom', `${origin}/preview`], { windowsHide: true });
      let errors = ''; child.stderr.on('data', data => { errors += data; }); child.stdout.resume();
      const timer = setTimeout(() => child.kill(), 22000);
      try {
        await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(`Chrome ${code}: ${errors.slice(-300)}`))); });
        await writeFile(path.join(evidence, `${scenario}-${width}.json`), JSON.stringify({ report, calls: fixture.calls, patches: fixture.patches, readsAfterWrite: fixture.readsAfterWrite }, null, 2));
        assert.ok(report, 'Chrome must return UI results'); assert.equal(report.error, undefined, JSON.stringify(report));
        for (const check of report.checks) assert.equal(check.pass, true, check.name);
        assert.deepEqual(fixture.unexpected, []);
        assert.equal(fixture.patches, ['conflict', 'conflict-missed', 'success', 'server-error', 'other-conflict'].includes(scenario) ? 1 : 0);
      } finally {
        clearTimeout(timer); if (child.exitCode === null) child.kill();
        const relative = path.relative(os.tmpdir(), profile);
        if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('caresenior-medication-ui-profile-')) await rm(profile, { recursive: true, force: true, maxRetries: 3 });
      }
    });
  }
  t.diagnostic(`Medication UI Chrome evidence: ${evidence}`);
});
