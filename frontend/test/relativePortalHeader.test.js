import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// A fresh Chrome profile and RAM-only server: never opens the user's browser/session,
// never reads .env, and rejects every application API request (including password changes).
const chrome = process.env.CARESENIOR_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('NguoiThan Header: Chrome layout, account menu and existing callbacks', { skip: !existsSync(chrome), timeout: 120000 }, async t => {
  const vite = await createServer({ root, configFile: false, envDir: false, plugins: [react()], appType: 'custom',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/blocked-api') }, server: { middlewareMode: true, hmr: false, ws: false } });
  let report;
  const unexpectedApi = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/__header_result' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      report = JSON.parse(body); res.end('ok'); return;
    }
    if (req.method !== 'GET' || req.url.startsWith('/blocked-api') || req.url.startsWith('/api/')) {
      unexpectedApi.push(`${req.method} ${req.url}`); res.writeHead(403); res.end(); return;
    }
    if (req.url.startsWith('/preview')) {
      const width = Number(new URL(req.url, 'http://fixture').searchParams.get('width'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<html lang="vi"><body style="margin:0;background:#edf3ef"><iframe title="Header ${width}px" style="border:0;width:${width}px;height:900px" src="/frame?run=1&width=${width}"></iframe></body></html>`); return;
    }
    if (req.url.startsWith('/frame')) {
      // Headless virtual time does not advance iframe animation frames reliably.
      // This fixture-only frame clock lets Ant Design's focus scheduling run.
      const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),16);window.cancelAnimationFrame=clearTimeout;</script><style>body{margin:0;font-family:Arial,sans-serif}*,*::before,*::after{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/test/fixtures/relativeHeaderPreview.jsx"></script></body></html>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await vite.close(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const evidence = process.env.CARESENIOR_HEADER_EVIDENCE || await mkdtemp(path.join(os.tmpdir(), 'caresenior-header-'));
  for (const width of [360, 768, 1024, 1440]) {
    await t.test(`${width}px: no overflow, menu, keyboard, password modal, logout`, { timeout: 28000 }, async () => {
      report = null;
      const profile = await mkdtemp(path.join(os.tmpdir(), 'caresenior-header-chrome-'));
      const child = spawn(chrome, ['--headless', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
        `--window-size=${Math.max(width + 30, 800)},1000`, '--force-device-scale-factor=1', '--virtual-time-budget=12000',
        `--screenshot=${path.join(evidence, `header-menu-${width}.png`)}`, '--dump-dom', `${origin}/preview?width=${width}`], { windowsHide: true });
      let errors = ''; child.stderr.on('data', data => { errors += data.toString(); }); child.stdout.resume();
      const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}: ${errors.slice(-500)}`))); });
      const timer = setTimeout(() => child.kill(), 25000);
      try {
        await completion;
        assert.ok(report, `No browser test report: ${errors.slice(-700)}`);
        assert.equal(report.error, undefined, JSON.stringify(report));
        for (const check of report.checks) assert.equal(check.pass, true, `${width}px: ${check.name}`);
        assert.deepEqual(unexpectedApi, [], 'UI actions must not write to an application API');
        assert.ok(existsSync(path.join(evidence, `header-menu-${width}.png`)), 'Chrome screenshot saved');
        await writeFile(path.join(evidence, `header-checks-${width}.json`), JSON.stringify(report, null, 2));
      } finally {
        clearTimeout(timer);
        if (child.exitCode === null) child.kill();
        // Delete only the fresh profile created by this test, never a user's Chrome profile.
        const relative = path.relative(os.tmpdir(), profile);
        if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('caresenior-header-chrome-')) {
          await rm(profile, { recursive: true, force: true, maxRetries: 3 });
        }
      }
    });
  }
  t.diagnostic(`Chrome screenshots: ${evidence}`);
});
