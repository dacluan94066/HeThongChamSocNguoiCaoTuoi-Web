import test from 'node:test';
import assert from 'node:assert/strict';
import { createElderlySosController, createElderlySafetyApi, notificationRoute, isRead, isSos } from '../src/utils/elderlySafety.js';

const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(overrides = {}) {
  let time = 0, interactive = true, session = true, id = 0;
  const timers = new Map(), posts = [], changes = [];
  const api = { sosHistory: async () => [], sendSos: async (location, signal) => { posts.push({ location, signal }); return { id: 1 }; }, ...overrides };
  const c = createElderlySosController({ api, now: () => time, current: () => session, interactive: () => interactive,
    schedule: fn => { timers.set(++id, fn); return id; }, unschedule: key => timers.delete(key), onRecorded: () => changes.push('recorded') });
  return { c, posts, timers, changes, advance: async milliseconds => { time += milliseconds; for (const fn of [...timers.values()]) fn(); await drain(); }, blur() { interactive = false; c.cancel(); }, expire() { session = false; } };
}
test('continuous 3000ms hold is required; early release, wrong source and repeated presses cannot POST', async () => {
  const f = fixture(); assert.equal(f.c.start('pointer:1'), true); assert.equal(f.c.start('pointer:2'), false);
  await f.advance(2999); assert.equal(f.posts.length, 0); f.c.release('pointer:2'); assert.equal(f.c.getSnapshot().phase, 'holding');
  f.c.release('pointer:1'); await f.advance(1); assert.equal(f.posts.length, 0);
  f.c.start('key: '); await f.advance(3000); assert.equal(f.posts.length, 1); assert.equal(f.posts[0].location, null);
  assert.equal(f.c.getSnapshot().phase, 'confirmed'); assert.equal(f.c.start('key: '), false); assert.equal(f.changes.length, 1);
});
test('blur, hidden/routed screen, cancellation, expired session and disposal before threshold send nothing', async () => {
  for (const stop of [f => f.blur(), f => f.c.cancel(), f => f.c.dispose(), f => f.expire()]) {
    const f = fixture(); f.c.start('key:Enter'); await f.advance(2999); stop(f); await f.advance(2000); assert.equal(f.posts.length, 0);
    f.c.dispose(); assert.equal(f.timers.size, 0);
  }
});
test('a pending request survives screen hold cancellation but never sends again; success requires API completion', async () => {
  let resolve;
  const f = fixture({ sendSos: (location, signal) => { f.posts.push({ location, signal }); return new Promise(done => { resolve = done; }); } });
  f.c.start('pointer:1'); await f.advance(3000); assert.equal(f.c.getSnapshot().phase, 'sending');
  f.c.cancel(); f.c.start('pointer:2'); await f.advance(20000); assert.equal(f.posts.length, 1);
  resolve({ id: 1 }); await drain(); assert.equal(f.c.getSnapshot().phase, 'confirmed');
});
test('timeout/connection loss/500 are uncertain, never automatically retried or promoted by history', async () => {
  for (const error of [Error('timeout'), { response: { status: 500 } }, { uncertain: true }]) {
    let posts = 0;
    const f = fixture({ sendSos: async () => { posts++; throw error; } });
    f.c.start('pointer:1'); await f.advance(3000); assert.equal(f.c.getSnapshot().phase, 'uncertain');
    assert.equal(f.c.reset(), false); await f.advance(30000); assert.equal(posts, 1);
    await f.c.reviewHistory(); assert.equal(f.c.getSnapshot().phase, 'uncertain'); assert.equal(f.c.getSnapshot().reviewed, true);
    assert.equal(f.c.reset(), true); assert.equal(posts, 1); assert.equal(f.c.getSnapshot().phase, 'idle');
  }
});
test('403/422 are explicit errors, and history-read failure does not unlock an uncertain send', async () => {
  const f = fixture({ sendSos: async () => { throw { response: { status: 403, data: { message: 'Không có quyền' } } }; } });
  f.c.start('key:Enter'); await f.advance(3000); assert.equal(f.c.getSnapshot().phase, 'error'); assert.equal(f.c.getSnapshot().error, 'Không có quyền');
  const g = fixture({ sendSos: async () => { throw Error('timeout'); }, sosHistory: async () => { throw Error('offline'); } });
  g.c.start('key:Enter'); await g.advance(3000); await g.c.reviewHistory(); assert.equal(g.c.reset(), false);
});
test('no GPS request without explicit locate; permission denial, invalid GPS and unsupported API still permit SOS without coordinates', async () => {
  for (const geo of [null, { getCurrentPosition: (_, reject) => reject({ code: 1 }) }, { getCurrentPosition: (_, reject) => reject({ code: 3 }) }, { getCurrentPosition: resolve => resolve({ coords: { latitude: 999, longitude: 1 } }) }]) {
    const f = fixture(); await f.c.locate(geo); assert.equal(f.c.getSnapshot().location, null);
    f.c.start('pointer:1'); await f.advance(3000); assert.equal(f.posts[0].location, null);
  }
});
test('consented fresh coordinates are sent, optional exclusion/expiry and late GPS responses never fake a position', async () => {
  const coords = { latitude: 10.75, longitude: 106.67 };
  const f = fixture(); await f.c.locate({ getCurrentPosition: (resolve, _, options) => { assert.equal(options.maximumAge, 0); resolve({ coords }); } });
  f.c.start('pointer:1'); await f.advance(3000); assert.deepEqual(f.posts[0].location, coords);
  const g = fixture(); await g.c.locate({ getCurrentPosition: resolve => resolve({ coords }) }); await g.advance(120001);
  g.c.start('pointer:1'); await g.advance(3000); assert.equal(g.posts[0].location, null);
  let deliver; const h = fixture(), pending = h.c.locate({ getCurrentPosition: resolve => { deliver = resolve; } });
  h.c.clearLocation(); deliver({ coords }); await pending; assert.equal(h.c.getSnapshot().location, null);
});
test('holding SOS while GPS is still pending sends without location and does not leave a stuck GPS spinner', async () => {
  const f = fixture(); let resolve;
  const gps = f.c.locate({ getCurrentPosition: done => { resolve = done; } });
  assert.equal(f.c.getSnapshot().locationPhase, 'loading');
  f.c.start('pointer:1'); assert.equal(f.c.getSnapshot().locationPhase, 'off');
  resolve({ coords: { latitude: 10.75, longitude: 106.67 } }); await gps;
  await f.advance(3000); assert.equal(f.posts[0].location, null); assert.equal(f.c.getSnapshot().location, null);
});
test('unmount/logout rejects a late POST response, and StrictMode lifecycle can restart a clean controller', async () => {
  let resolve; const f = fixture({ sendSos: () => new Promise(done => { resolve = done; }) });
  f.c.start('pointer:1'); await f.advance(3000); f.c.dispose(); resolve({ id: 1 }); await drain(); assert.equal(f.changes.length, 0);
  f.c.activate(); assert.equal(f.c.getSnapshot().location, null); assert.equal(f.c.start('pointer:2'), true); f.c.cancel();
});
test('StrictMode effect replay retains store subscriptions so hold progress and sending state remain visible', async () => {
  const f = fixture(); let updates = 0;
  const unsubscribe = f.c.subscribe(() => { updates++; });
  f.c.dispose(); f.c.activate(); f.c.start('pointer:1'); await f.advance(1000);
  assert.ok(updates >= 2); assert.equal(f.c.getSnapshot().phase, 'holding'); assert.equal(f.c.getSnapshot().progress, 1 / 3);
  f.c.cancel(); unsubscribe(); const before = updates;
  f.c.start('pointer:2'); await f.advance(1000); assert.equal(updates, before); f.c.dispose();
});

test('safety API is own-scoped, projects fields, deduplicates rows and rejects a foreign profile or notice owner', async () => {
  const calls = [], owner = { profileId: 42, userId: 7 }, stamp = { token: 'fixed' };
  let rows = [{ id: 1, nguoiCaoTuoiId: 42, noiDung: 'Own', ghiChuXuLy: 'INTERNAL', cccd: 'SECRET' }, { id: 1, nguoiCaoTuoiId: 42 }];
  const api = createElderlySafetyApi({ get: async (...args) => { calls.push(args); return { data: { success: true, data: rows } }; } }, owner, () => stamp);
  const data = await api.alerts(); assert.equal(data.length, 1); assert.equal(data[0].noiDung, 'Own'); assert.equal('ghiChuXuLy' in data[0], false);
  assert.equal(calls[0][0], '/elderly/me/alerts'); assert.equal(calls[0][1].webSessionStamp, stamp);
  rows = [{ id: 1, nguoiCaoTuoiId: 999 }]; await assert.rejects(api.sosHistory(), /không thuộc/);
  rows = [{ id: 1, userId: 999 }]; await assert.rejects(api.notifications(), /không thuộc/);
});
test('SOS adapter strips foreign identity fields, sends only consented valid coords and verifies backend acknowledgement', async () => {
  const calls = []; let data = { id: 1, nguoiCaoTuoiId: 42, ngayGui: '2026-10-27T06:05:00Z' };
  const api = createElderlySafetyApi({ post: async (...args) => { calls.push(args); return { data: { success: true, data } }; } }, { profileId: 42 });
  await api.sendSos(null); assert.deepEqual(calls[0][1], { noiDung: 'Cảnh báo SOS khẩn cấp' });
  await api.sendSos({ latitude: 10, longitude: 106, userId: 999 }); assert.deepEqual(calls[1][1], { noiDung: 'Cảnh báo SOS khẩn cấp', viDo: 10, kinhDo: 106 });
  await assert.rejects(api.sendSos({ latitude: 100, longitude: 0 })); assert.equal(calls.length, 2);
  data = { ...data, nguoiCaoTuoiId: 999 }; await assert.rejects(api.sendSos(null), error => error.uncertain === true);
});
test('notification mark-read never calls seen/resolve; only whitelisted workspace routes can be linked', async () => {
  const calls = [];
  const api = createElderlySafetyApi({ patch: async (...args) => { calls.push(args); return { data: { success: true, data: { id: 5, daDoc: true } } }; } }, { profileId: 42 });
  await api.markRead(5); assert.equal(calls[0][0], '/notifications/5/read'); await assert.rejects(api.markRead('../seen')); assert.equal(calls.length, 1);
  assert.equal(notificationRoute({ lienKetBang: 'CanhBaoKhanCap' }), '/ca-nhan/sos');
  assert.equal(notificationRoute({ lienKetBang: 'LichUongThuoc:20261027' }), '/ca-nhan/lich-trinh?tab=thuoc');
  assert.equal(notificationRoute({ lienKetBang: 'https://malicious.test' }), null);
  assert.equal(isRead(0), false); assert.equal(isRead(true), true); assert.equal(isSos({ nguonBang: 'ChiSoSucKhoe', mucDo: 'KhanCap' }), false);
});
