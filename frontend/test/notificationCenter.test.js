import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNotificationApi, createNotificationStore, normalizeNotifications, staffNotificationRoute, subscribeNotificationEvents } from '../src/utils/notificationCenter.js';
import { formatAlertTime } from '../src/utils/alertTime.js';

const notice = (id, extra = {}) => ({ id, tieuDe: `Fixture ${id}`, ngayTao: '2026-10-28T13:05:00', daDoc: false, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(api = {}) {
  let current = true;
  const jobs = new Set();
  const store = createNotificationStore({ api: { list: async () => [notice(1), notice(2)], read: async () => {}, ...api },
    current: () => current, userId: 70, schedule: job => { jobs.add(job); return job; }, unschedule: job => jobs.delete(job) });
  store.activate();
  return { store, jobs, changeSession: () => { current = false; store.clear(); },
    async flush() { const next = [...jobs]; jobs.clear(); for (const job of next) job(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('notifications are projected, deduplicated by ID and sorted by actual Vietnam instant', () => {
  const rows = normalizeNotifications([notice(1), notice(2, { ngayTao: '2026-10-28T06:05:00Z' }), notice(3, { ngayTao: '2026-10-28T23:55:00' }),
    notice(1, { daDoc: true, token: 'PRIVATE', viDo: 10 }), notice(1)], 70);
  assert.deepEqual(rows.map(row => row.id), [3, 2, 1]);
  assert.equal(rows[2].daDoc, true);
  assert.equal(JSON.stringify(rows).includes('PRIVATE'), false);
  assert.equal('viDo' in rows[2], false);
  assert.equal(formatAlertTime(rows[0].ngayTao), '28/10/2026 23:55');
  assert.equal(formatAlertTime(rows[1].ngayTao), '28/10/2026 13:05');
  assert.throws(() => normalizeNotifications([notice(1, { userId: 999 })], 70));
  assert.throws(() => normalizeNotifications([notice(0)], 70));
});

test('notification links are a permission/role allowlist, never a supplied URL', () => {
  for (const role of ['QuanTriVien', 'NguoiChamSoc']) {
    assert.equal(staffNotificationRoute({ lienKetBang: 'LichKhamBenh:clock' }, role, () => true), '/lich-kham-benh');
    assert.equal(staffNotificationRoute({ lienKetBang: 'CanhBaoKhanCap' }, role, () => true), '/canh-bao?tab=sos');
    assert.equal(staffNotificationRoute({ lienKetBang: 'CanhBao' }, role, () => false), null);
    assert.equal(staffNotificationRoute({ lienKetBang: 'javascript:alert(1)' }, role, () => true), null);
  }
  for (const role of ['NguoiThan', 'NguoiCaoTuoi']) assert.equal(staffNotificationRoute({ lienKetBang: 'CanhBaoKhanCap' }, role, () => true), null);
});

test('adapter uses only existing own GET and read PATCH contracts, verifies acknowledgement', async () => {
  const calls = [], stamp = { token: 'RAM-fixture' };
  const api = createNotificationApi({ get: async (...args) => { calls.push(args); return { data: { success: true, data: [notice(1)] } }; },
    patch: async (...args) => { calls.push(args); return { data: { success: true, data: { id: 1, daDoc: 1 } } }; } }, 70, stamp);
  await api.list(); await api.read(1);
  assert.equal(calls[0][0], '/notifications/me'); assert.equal(calls[0][1].webSessionStamp, stamp);
  assert.equal(calls[1][0], '/notifications/1/read'); assert.deepEqual(calls[1][1], {});
  await assert.rejects(api.read(-1));
  const bad = createNotificationApi({ patch: async () => ({ data: { success: true, data: { id: 2, daDoc: true } } }) }, 70, stamp);
  await assert.rejects(bad.read(1));
});

test('loading/empty/error states and opening reads never mark everything read', async () => {
  const pending = deferred(); let writes = 0;
  const f = setup({ list: () => pending.promise, read: async () => { writes++; } });
  const loading = f.store.refresh(); assert.equal(f.store.getSnapshot().loading, true);
  pending.resolve([]); await loading;
  assert.equal(f.store.getSnapshot().loaded, true); assert.deepEqual(f.store.getSnapshot().items, []); assert.equal(writes, 0);
  f.store.dispose();
  const failed = setup({ list: async () => { throw Error('offline'); } });
  await failed.store.refresh(); assert.match(failed.store.getSnapshot().error, /kết nối/); failed.store.dispose();
});

test('only server-confirmed read changes badge; duplicate clicks share one PATCH', async () => {
  const pending = deferred(); let writes = 0;
  const f = setup({ read: () => { writes++; return pending.promise; } }); await f.store.refresh();
  const first = f.store.read(1), duplicate = f.store.read(1);
  assert.equal(first, duplicate); assert.equal(writes, 1); assert.equal(f.store.getSnapshot().items.filter(row => !row.daDoc).length, 2);
  pending.resolve(); await first;
  assert.equal(f.store.getSnapshot().items.filter(row => !row.daDoc).length, 1);
  await f.store.read(1); assert.equal(writes, 1); f.store.dispose();
});

test('read failure preserves unread state and permits only an explicit retry', async () => {
  let writes = 0;
  const f = setup({ read: async () => { writes++; throw Error('offline'); } }); await f.store.refresh();
  assert.equal(await f.store.read(1), false); assert.equal(writes, 1);
  assert.equal(f.store.getSnapshot().items.every(row => !row.daDoc), true);
  assert.match(f.store.getSnapshot().readError, /Chưa đánh dấu/); f.store.dispose();
});

test('a stale GET completing after a successful PATCH cannot restore unread', async () => {
  const pending = deferred(); let calls = 0;
  const f = setup({ list: () => ++calls === 1 ? Promise.resolve([notice(1)]) : pending.promise });
  await f.store.refresh(); const refresh = f.store.refresh(); await f.store.read(1);
  pending.resolve([notice(1)]); await refresh;
  assert.equal(f.store.getSnapshot().items[0].daDoc, true); f.store.dispose();
});

test('account switching clears data immediately and ignores late old GET/PATCH results', async () => {
  const read = deferred(), load = deferred(); let calls = 0;
  const f = setup({ list: () => ++calls === 1 ? Promise.resolve([notice(1)]) : load.promise, read: () => read.promise });
  await f.store.refresh(); const refresh = f.store.refresh(), mark = f.store.read(1); f.changeSession();
  assert.deepEqual(f.store.getSnapshot().items, []);
  read.resolve(); load.resolve([notice(1, { noiDung: 'OLD PRIVATE' })]); await refresh; await mark;
  assert.deepEqual(f.store.getSnapshot().items, []); f.store.dispose();
});

test('403 erases prior rows rather than leaving private notification text in a denied session', async () => {
  let calls = 0;
  const f = setup({ list: async () => { if (++calls > 1) throw { response: { status: 403 } }; return [notice(1)]; } });
  await f.store.refresh(); await f.store.refresh(); assert.deepEqual(f.store.getSnapshot().items, []);
  assert.equal(f.store.getSnapshot().loading, false); assert.match(f.store.getSnapshot().error, /quyền/); f.store.dispose();
});

test('StrictMode dispose/reactivate removes medical cache but retains subscriber lifecycle', async () => {
  const f = setup(); let updates = 0;
  const unsubscribe = f.store.subscribe(() => updates++);
  await f.store.refresh(); f.store.dispose(); assert.deepEqual(f.store.getSnapshot().items, []);
  f.store.activate(); await f.flush(); assert.equal(f.store.getSnapshot().items.length, 2); assert.ok(updates > 2);
  unsubscribe(); f.store.dispose();
});

test('socket bursts coalesce, render no event text, and listener cleanup never touches SOS listeners', async () => {
  let calls = 0, valid = true;
  const socket = new EventEmitter(), browser = new EventTarget(), document = new EventTarget(); document.visibilityState = 'visible';
  const f = setup({ list: async () => { calls++; return [notice(1), notice(1)]; } }); await f.flush();
  const sos = () => {}; socket.on('canhbao:new', sos);
  const unbind = subscribeNotificationEvents({ socket, store: f.store, userId: 70, current: () => valid, browser, document });
  socket.emit('thongbao:new', { id: 2, userId: 999 }); await f.flush(); assert.equal(calls, 1);
  for (let i = 0; i < 10; i++) socket.emit('thongbao:new', { id: 2, noiDung: 'DO NOT TRUST' });
  await f.flush(); assert.equal(calls, 2); assert.equal(f.store.getSnapshot().items.length, 1);
  assert.equal(JSON.stringify(f.store.getSnapshot()).includes('DO NOT TRUST'), false);
  socket.emit('connect'); await f.flush(); assert.equal(calls, 3);
  valid = false; browser.dispatchEvent(new Event('focus')); await f.flush(); assert.equal(calls, 3);
  unbind(); assert.equal(socket.listenerCount('thongbao:new'), 0); assert.equal(socket.listeners('canhbao:new')[0], sos); f.store.dispose();
});
