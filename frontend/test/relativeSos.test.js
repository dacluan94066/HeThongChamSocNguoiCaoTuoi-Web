import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSosAlarmController } from '../src/utils/sosAlarm.js';
import { createRelativeSosController } from '../src/utils/relativeSos.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
const NOW = Date.now();
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
class Storage {
  values = new Map(); listeners = new Set();
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); for (const fn of this.listeners) queueMicrotask(() => fn({ key, newValue: value })); }
  removeItem(key) { this.values.delete(key); }
}
class Locks {
  held = new Set(); queues = new Map();
  request(key, options, callback) {
    if (this.held.has(key)) {
      if (options.ifAvailable) return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => { const queue = this.queues.get(key) || []; queue.push({ options, callback, resolve, reject }); this.queues.set(key, queue); });
    }
    this.held.add(key); return Promise.resolve().then(() => callback({ name: key })).finally(() => {
      this.held.delete(key); const next = this.queues.get(key)?.shift(); if (next) this.request(key, next.options, next.callback).then(next.resolve, next.reject);
    });
  }
}
const event = (id = 101, elderlyId = 7) => ({ nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: id, nguoiCaoTuoiId: elderlyId,
  nguoiCaoTuoiTen: 'PRIVATE_FORGED', moTa: 'PRIVATE_GPS', viDo: 99, kinhDo: 99, ghiChuXuLy: 'PRIVATE_INTERNAL' });
function fixture(options = {}) {
  const storage = options.storage || new Storage(), locks = options.locks || new Locks();
  const audios = [], timers = new Map(), notices = [], destroyed = [], calls = [];
  let timerSequence = 0;
  const rows = [{ id: '101', nguoiCaoTuoiId: 7, trangThai: 'DangGui', ngayGui: new Date(NOW).toISOString() },
    { id: '102', nguoiCaoTuoiId: 8, trangThai: 'DangGui', ngayGui: new Date(NOW).toISOString() }];
  const allowed = new Set([7, 8]);
  const api = { profile: async id => { calls.push(['profile', id]); if (!allowed.has(id)) throw { response: { status: 403 } }; return { id, hoTen: `Trusted NCT ${id}`, cccd: 'PRIVATE' }; },
    read: async (id, section, _profile, query) => { calls.push(['read', id, section, query]); if (!allowed.has(id)) throw { response: { status: 403 } }; return rows.filter(row => row.nguoiCaoTuoiId === id).map(row => ({ ...row, viDo: 'PRIVATE', ghiChuXuLy: 'PRIVATE' })); }, ...options.api };
  const alarm = createSosAlarmController({ storage, locks, createChannel: null, now: () => NOW,
    setTimeout: (fn, delay) => { const id = ++timerSequence; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    addStorageListener: fn => { storage.listeners.add(fn); return () => storage.listeners.delete(fn); },
    createAudio: src => { const audio = { src, loop: false, paused: false, currentTime: 0, plays: 0,
      play() { this.plays++; if (options.blocked?.value) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); return Promise.resolve(); },
      pause() { this.paused = true; }, addEventListener() {} }; audios.push(audio); return audio; },
  });
  const manager = createRelativeSosController({ api, alarm, storage, now: () => NOW, onNotice: sos => notices.push(sos), onDestroy: id => destroyed.push(id) });
  manager.configure(10, true);
  return { manager, alarm, storage, locks, audios, timers, notices, destroyed, calls, rows, allowed,
    dispose() { manager.clear(); alarm.dispose(); } };
}

test('SOS is verified through relative GET profile/SOS before display or audio; socket private text is ignored', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush();
    assert.equal(f.notices.length, 1); assert.equal(f.notices[0].name, 'Trusted NCT 7');
    assert.doesNotMatch(JSON.stringify(f.manager.getSnapshot()), /PRIVATE|viDo|kinhDo|cccd|ghiChu/);
    assert.deepEqual(f.calls.slice(0, 2).map(call => call.slice(0, 2)), [['profile', 7], ['read', 7]]);
    assert.equal(f.alarm.getSnapshot().ringing, true);
  } finally { f.dispose(); }
});

test('unlinked elderly, revoked consent and ordinary alerts never ring', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); f.allowed.delete(7); await f.manager.receive(event());
    assert.equal(f.alarm.getSnapshot().ringing, false); assert.equal(f.manager.getSnapshot().alerts.length, 0);
    const before = f.calls.length; await f.manager.receive({ loaiCanhBao: 'ChiSoBatThuong', mucDo: 'KHAN_CAP', id: 1 });
    assert.equal(f.calls.length, before); assert.equal(f.notices.length, 0);
  } finally { f.dispose(); }
});

test('sound remains off until enabled, while verified SOS still appears', async () => {
  const f = fixture();
  try { await f.manager.receive(event()); await flush(); assert.equal(f.notices.length, 1); assert.equal(f.audios.length, 0); }
  finally { f.dispose(); }
});

test('duplicate and concurrent events cause one notice and one continuous alarm', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await Promise.all([f.manager.receive(event()), f.manager.receive(event())]); await f.manager.receive(event()); await flush();
    assert.equal(f.notices.length, 1); assert.equal(f.audios.filter(a => a.loop).length, 1);
  } finally { f.dispose(); }
});

test('two tab controllers share existing audio locks and do not overlap', async () => {
  const storage = new Storage(), locks = new Locks(); storage.setItem('caresenior:sos:v1:10:enabled', '1');
  const a = fixture({ storage, locks }), b = fixture({ storage, locks });
  try {
    await Promise.all([a.manager.receive(event()), b.manager.receive(event())]); await flush();
    assert.equal([...a.audios, ...b.audios].filter(audio => audio.loop && !audio.paused).length, 1);
    assert.equal(a.notices.length + b.notices.length, 1);
  } finally { a.dispose(); b.dispose(); }
});

test('silence never writes SOS status and a replay after reconnect does not ring again', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush(); f.manager.silence(); await flush();
    assert.equal(f.alarm.getSnapshot().ringing, false);
    f.manager.configure(10, false); f.manager.configure(10, true); await f.manager.receive(event()); await flush();
    assert.equal(f.alarm.getSnapshot().ringing, false); assert.equal(f.notices.length, 1);
    assert.equal(f.calls.every(call => ['profile', 'read'].includes(call[0])), true);
  } finally { f.dispose(); }
});

test('revoking one elderly removes only that SOS, closes detail and leaves another valid alarm', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await f.manager.receive(event(102, 8)); await flush();
    await f.manager.openDetail(101); assert.equal(f.manager.getSnapshot().detail.elderlyId, 7);
    f.allowed.delete(7); f.manager.accessChanged({ nguoiCaoTuoiId: 7 });
    assert.deepEqual(f.manager.getSnapshot().alerts.map(s => s.elderlyId), [8]); assert.equal(f.manager.getSnapshot().detail, null);
    assert.equal(f.alarm.getSnapshot().ringing, true); assert.ok(f.destroyed.includes(101));
    f.manager.accessChanged({ nguoiCaoTuoiId: 8 }); assert.equal(f.alarm.getSnapshot().ringing, false);
  } finally { f.dispose(); }
});

test('revocation during API verification invalidates the late response', async () => {
  const pending = deferred(); const f = fixture({ api: { read: () => pending.promise } });
  try {
    await f.manager.enable(); const result = f.manager.receive(event()); await flush(); f.manager.accessChanged({ nguoiCaoTuoiId: 7 });
    pending.resolve([{ id: 101, nguoiCaoTuoiId: 7, ngayGui: new Date(NOW).toISOString(), trangThai: 'DangGui' }]); await result;
    assert.equal(f.notices.length, 0); assert.equal(f.alarm.getSnapshot().ringing, false);
  } finally { f.dispose(); }
});

test('autoplay block is explicit; enabling again rechecks current access before alarm', async () => {
  const blocked = { value: true }, f = fixture({ blocked });
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush();
    assert.equal(f.alarm.getSnapshot().blocked, true); assert.equal(f.notices.length, 1);
    blocked.value = false; f.allowed.delete(7); await f.manager.enable(); await flush();
    assert.equal(f.alarm.getSnapshot().ringing, false); assert.equal(f.manager.getSnapshot().alerts.length, 0);
  } finally { f.dispose(); }
});

test('confirmed update closes sound without writing a state or replaying an alarm', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush(); f.rows[0].trangThai = 'DaXuLy';
    await f.manager.receive(event(), 'canhbao:updated'); await flush();
    assert.equal(f.alarm.getSnapshot().ringing, false); assert.equal(f.manager.getSnapshot().alerts[0].status, 'DaXuLy');
  } finally { f.dispose(); }
});

test('family sound has a two-minute cap and silencing keeps the visible SOS', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush();
    const limit = [...f.timers.values()].find(timer => timer.delay === 120000); assert.ok(limit); limit.fn(); await flush();
    assert.equal(f.alarm.getSnapshot().ringing, false); assert.equal(f.manager.getSnapshot().alerts.length, 1);
  } finally { f.dispose(); }
});

test('late old SOS and historical REST data never sound like a new SOS', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); f.rows[0].ngayGui = new Date(NOW - 6 * 60000).toISOString(); await f.manager.receive(event()); await flush();
    assert.equal(f.notices.length, 0); assert.equal(f.alarm.getSnapshot().ringing, false);
  } finally { f.dispose(); }
});

test('401 or offline verification closes data and never simulates an accepted SOS', async () => {
  for (const error of [{ response: { status: 401 } }, new Error('offline')]) {
    const f = fixture({ api: { read: async () => { throw error; } } });
    try { await f.manager.enable(); await f.manager.receive(event()); assert.equal(f.notices.length, 0); assert.equal(f.alarm.getSnapshot().ringing, false); assert.ok(f.manager.getSnapshot().error); }
    finally { f.dispose(); }
  }
});

test('stored metadata has identifiers and times only; logout clears medical display state', async () => {
  const f = fixture();
  try {
    await f.manager.enable(); await f.manager.receive(event()); await flush();
    assert.doesNotMatch(JSON.stringify([...f.storage.values]), /Trusted|PRIVATE|elderlyId|content|name|viDo|kinhDo/);
    f.manager.clear(); assert.deepEqual(f.manager.getSnapshot().alerts, []); assert.equal(f.alarm.getSnapshot().ringing, false);
  } finally { f.dispose(); }
});

test('periodic revalidation purges an active SOS when permissions are removed without a socket event', async () => {
  const f = fixture();
  try { await f.manager.enable(); await f.manager.receive(event()); await flush(); f.allowed.clear(); await f.manager.revalidate(); assert.equal(f.manager.getSnapshot().alerts.length, 0); assert.equal(f.alarm.getSnapshot().ringing, false); }
  finally { f.dispose(); }
});

test('relative UI has read-only details and reuses the existing Socket.IO/audio instance', () => {
  const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const hook = read('hooks/useRelativeSos.js'), panel = read('components/RelativeSosPanel.jsx');
  assert.match(hook, /getSocket/); assert.match(hook, /getSosAlarmController/);
  assert.doesNotMatch(hook, /new Audio|\bio\(|\.emit\(/);
  assert.doesNotMatch(panel, /markSeen|resolve|kinhDo|viDo|ghiChuXuLy|Tiếp nhận|Xử lý|Kết thúc/);
  assert.match(panel, /SosAudioControls readOnly/); assert.match(panel, /Chi tiết SOS được chia sẻ/);
});

test('late periodic response cannot overwrite a newer confirmed SOS status', async () => {
  const pending = deferred(); let reads = 0;
  const row = { id: 101, nguoiCaoTuoiId: 7, ngayGui: new Date(NOW).toISOString(), trangThai: 'DangGui' };
  const f = fixture({ api: { read: async () => ++reads === 2 ? pending.promise : [{ ...row }] } });
  try {
    await f.manager.receive(event());
    const check = f.manager.revalidate(); await flush();
    row.trangThai = 'DaXuLy'; await f.manager.receive(event(), 'canhbao:updated');
    pending.resolve([{ ...row, trangThai: 'DangGui' }]); await check;
    assert.equal(f.manager.getSnapshot().alerts[0].status, 'DaXuLy');
  } finally { f.dispose(); }
});

test('late enable check cannot rearm an SOS resolved while audio was being enabled', async () => {
  const pending = deferred(); let reads = 0;
  const row = { id: 101, nguoiCaoTuoiId: 7, ngayGui: new Date(NOW).toISOString(), trangThai: 'DangGui' };
  const f = fixture({ api: { read: async () => ++reads === 2 ? pending.promise : [{ ...row }] } });
  try {
    await f.manager.receive(event());
    const enabled = f.manager.enable(); await flush();
    row.trangThai = 'DaXuLy'; await f.manager.receive(event(), 'canhbao:updated');
    pending.resolve([{ ...row, trangThai: 'DangGui' }]); await enabled; await flush();
    assert.equal(f.manager.getSnapshot().alerts[0].status, 'DaXuLy');
    assert.equal(f.alarm.getSnapshot().ringing, false);
  } finally { f.dispose(); }
});
