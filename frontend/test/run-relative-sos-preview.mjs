// Production Web + actual production Socket.IO/SOS helpers, with the SQL RAM model only.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRequire = createRequire(path.join(root, 'package.json'));
const serverRequire = createRequire(path.join(root, '../server/package.json'));
const { createFixture } = serverRequire('./test/fixtures/relative-sos-fixture.cjs');
const { createRelativeRealtime } = serverRequire('./src/services/relativeRealtime.service');
const { createServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
const { default: react } = await import(pathToFileURL(frontendRequire.resolve('@vitejs/plugin-react')).href);
const origin = 'http://127.0.0.1:5193';
const vite = await createServer({ root, configFile: false, envDir: false, appType: 'custom', plugins: [react()],
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', strictPort: true },
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/api`), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin) } });
const json = (res, data) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
let fixture;
fixture = createFixture({ fallback: async (req, res) => {
  try {
    if (req.url === '/__relative_sos/state') return json(res, { fixtureOnly: true, committed: fixture.state.committed,
      sos: fixture.state.sos.map(row => ({ id: row.id, elderlyId: row.elderlyId, status: row.trangThai })),
      notifications: fixture.state.notifications.map(row => ({ id: row.id, userId: row.userId, sosId: row.sosId })),
      events: fixture.state.events, requests: fixture.state.requests, errors: fixture.state.errors });
    if (req.url === '/__relative_sos/control' && req.method === 'POST') {
      let text = ''; for await (const chunk of req) text += chunk;
      const { action } = JSON.parse(text);
      if (action === 'send7') await fixture.send(3);
      else if (action === 'send8') await fixture.send(4);
      else if (action === 'revoke7') fixture.revoke(10, 7);
      else if (action === 'revoke8') fixture.revoke(10, 8);
      else if (action === 'ordinary') fixture.sockets.emitToUser(10, 'canhbao:new', { nguoiCaoTuoiId: 7, loaiCanhBao: 'ChiSoBatThuong', mucDo: 'KHAN_CAP', moTa: 'Thông báo thường mô phỏng' });
      else if (action === 'disconnect') { for (const socket of await fixture.io.fetchSockets()) if (socket.user?.userId === 10) socket.conn.close(); }
      else if (['replay7', 'replay8', 'resolve7'].includes(action)) {
        const elderlyId = action === 'replay8' ? 8 : 7, row = fixture.state.sos.find(row => row.elderlyId === elderlyId);
        if (row) {
          if (action === 'resolve7') { row.trangThai = 'DaXuLy'; await fixture.notifications.emitSosAlertUpdate(elderlyId, { canhBaoId: row.alertId }); }
          else await createRelativeRealtime(fixture.pool, fixture.sql, (userId, event, data) => {
            fixture.state.events.push({ userId, event, data }); fixture.sockets.emitToUser(userId, event, data);
          }).emitSos(elderlyId, { nguoiCaoTuoiId: elderlyId, nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: row.id });
        }
      }
      else throw new Error('Unknown fixture action');
      return json(res, { fixtureOnly: true, action });
    }
    if (/^\/(src|test|node_modules|@|audio)/.test(req.url)) return vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
    const html = await vite.transformIndexHtml(req.url, `<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script>window.__RELATIVE_SOS_FIXTURE_TOKEN__=${JSON.stringify(fixture.token(10))};</script><script type="module" src="/test/fixtures/relativeSosPreview.jsx"></script></body></html>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } catch { res.writeHead(500); res.end('Isolated fixture failure'); }
} });
await fixture.start(5193);
console.log(`${origin}/nguoi-than-cua-toi — actual Socket.IO + SQL RAM, no real SOS/database`);
const close = async () => { await fixture.stop(); await vite.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
