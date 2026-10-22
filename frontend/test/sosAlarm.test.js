import test from 'node:test';
import assert from 'node:assert/strict';
import { createSosAlarmController, normalizeSos, formatSosTime, SOS_AUDIO_SRC } from '../src/utils/sosAlarm.js';

const event = (id = 101, extra = {}) => ({ nguonBang: 'CanhBaoKhanCap', nguonId: id, canhBaoKhanCapId: id,
  canhBaoId: id + 100, nguoiCaoTuoiId: 7, nguoiCaoTuoiTen: 'NCT kiểm thử', noiDung: 'SOS kiểm thử',
  ngayGui: '2026-10-23T09:10:11', trangThai: 'CHUA_XU_LY', ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
class Storage {
  values = new Map(); listeners = new Set(); blocked = false;
  getItem(key) { if (this.blocked) throw new Error('storage denied'); return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.blocked) throw new Error('storage denied');
    this.values.set(key, value);
    for (const fn of this.listeners) queueMicrotask(() => fn({ key, newValue: value }));
  }
  removeItem(key) { if (this.blocked) throw new Error('storage denied'); this.values.delete(key); }
}
class Locks {
  held = new Set(); queues = new Map();
  request(name, options, fn) {
    if (this.held.has(name)) {
      if (options.ifAvailable) return Promise.resolve(fn(null));
      return new Promise((resolve, reject) => {
        const queue = this.queues.get(name) || []; queue.push({ options, fn, resolve, reject }); this.queues.set(name, queue);
      });
    }
    this.held.add(name);
    return Promise.resolve().then(() => fn({ name })).finally(() => {
      this.held.delete(name);
      const next = this.queues.get(name)?.shift();
      if (next) this.request(name, next.options, next.fn).then(next.resolve, next.reject);
    });
  }
}
function fixture(options = {}) {
  const storage = options.storage || new Storage();
  const locks = Object.hasOwn(options, 'locks') ? options.locks : new Locks();
  const audios = [];
  const timers = new Map();
  const controller = createSosAlarmController({ storage, locks, createChannel: null,
    now: () => Date.UTC(2026, 9, 23, 5),
    addStorageListener: (fn) => { storage.listeners.add(fn); return () => storage.listeners.delete(fn); },
    setTimeout: (fn) => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id),
    createAudio: (src) => {
      const audio = { src, loop: false, pauses: 0, plays: 0, currentTime: 0, handlers: {},
        addEventListener(name, fn) { this.handlers[name] = fn; },
        play() { this.plays++; return options.play ? options.play(this, audios.length) : Promise.resolve(); },
        pause() { this.pauses++; },
      };
      audios.push(audio); return audio;
    },
  });
  const configure = (userId = 2, authorized = true) => controller.configure({ userId, authorized });
  const enabled = (userId = 2) => { storage.setItem(`caresenior:sos:v1:${userId}:enabled`, '1'); configure(userId); };
  return { controller, storage, locks, audios, timers, configure, enabled };
}

test('SOS normalization uses real source/id, labels, and bounded display data', () => {
  const sos = normalizeSos(event());
  assert.equal(sos.id, 101); assert.equal(sos.alertId, 201); assert.equal(sos.key, 'sos:101');
  assert.equal(sos.name, 'NCT kiểm thử'); assert.equal(sos.statusLabel, 'Chưa xử lý');
  assert.equal(normalizeSos(event(102, { trangThai: 'DaXuLy' })).statusLabel, 'Đã xử lý');
  assert.equal(normalizeSos(event(102, { trangThai: 'OTHER' })).statusLabel, 'Chưa rõ trạng thái');
  const long = normalizeSos(event(103, { nguoiCaoTuoiTen: 'A'.repeat(150), noiDung: 'B'.repeat(900) }));
  assert.equal(long.name.length, 100); assert.equal(long.content.length, 500);
});

test('ordinary or severe health alerts, malformed IDs and contradictory sources never become SOS', () => {
  for (const input of [null, [], {}, { mucDo: 'KHAN_CAP', loaiCanhBao: 'KhanCap', id: 101 },
    event(0), event(-1), event(true), event({}, { nguonId: 101 }),
    event(101, { nguonBang: 'ChiSoSucKhoe' }), event(101, { canhBaoKhanCapId: '1e2', nguonId: '1e2' })]) {
    assert.equal(normalizeSos(input), null);
  }
  assert.equal(normalizeSos(event(101, { nguonBang: undefined })).id, 101);
});

test('Vietnam time display is timezone independent and rejects invalid dates', () => {
  assert.equal(formatSosTime('2026-10-23T09:10:11'), formatSosTime('2026-10-23T02:10:11Z'));
  assert.equal(formatSosTime('2026-10-23T09:10:11+07:00'), formatSosTime('2026-10-23T02:10:11Z'));
  assert.match(formatSosTime('2026-10-23T09:10:11'), /09:10:11/);
  for (const bad of [null, '', '1', 'not-a-date', '2026-02-30T09:00:00', '2026-10-23T25:00:00']) assert.equal(formatSosTime(bad), 'Chưa rõ thời gian');
});

test('default sound is off; unauthorized users and ordinary events cannot start audio', async () => {
  const f = fixture();
  try {
    f.configure(2, false); assert.equal(f.controller.receive(event()), null); assert.equal(await f.controller.enable(), false);
    f.configure(); assert.equal(f.controller.getSnapshot().enabled, false);
    assert.ok(f.controller.receive(event()));
    f.controller.receive({ mucDo: 'KHAN_CAP', id: 500 });
    await flush(); assert.equal(f.audios.length, 0);
  } finally { f.controller.dispose(); }
});

test('explicit enable plays a short local confirmation tone and persists only preference', async () => {
  const f = fixture();
  try {
    f.configure(); assert.equal(await f.controller.enable(), true);
    assert.equal(f.audios.length, 1); assert.equal(f.audios[0].src, SOS_AUDIO_SRC); assert.equal(f.audios[0].loop, false);
    assert.equal(f.controller.getSnapshot().ringing, false);
    for (const fn of f.timers.values()) fn();
    assert.ok(f.audios[0].pauses > 0);
    assert.equal(f.storage.getItem('caresenior:sos:v1:2:enabled'), '1');
  } finally { f.controller.dispose(); }
});

test('enabled SOS rings once, silence only stops sound, next SOS rings again', async () => {
  const f = fixture();
  try {
    f.enabled(); assert.ok(f.controller.receive(event())); await flush();
    assert.equal(f.audios.length, 1); assert.equal(f.audios[0].loop, true); assert.equal(f.controller.getSnapshot().ringing, true);
    assert.equal(f.controller.receive(event()), null); await flush(); assert.equal(f.audios.length, 1);
    f.controller.silence(); await flush();
    assert.ok(f.audios[0].pauses > 0); assert.equal(f.controller.getSnapshot().enabled, true); assert.equal(f.controller.getSnapshot().ringing, false);
    f.controller.receive(event(102)); await flush(); assert.equal(f.audios.length, 2); assert.equal(f.controller.getSnapshot().ringing, true);
    const persisted = JSON.stringify([...f.storage.values]);
    assert.doesNotMatch(persisted, /NCT kiểm thử|SOS kiểm thử|ngayGui|nguoiCaoTuoiTen|09:10:11/);
  } finally { f.controller.dispose(); }
});

test('several SOS while ringing share one loop and all IDs persist as heard', async () => {
  const f = fixture();
  try {
    f.enabled(); f.controller.receive(event(101)); await flush();
    f.controller.receive(event(102)); f.controller.receive(event(103)); await flush();
    assert.equal(f.audios.length, 1);
    assert.deepEqual(JSON.parse(f.storage.getItem('caresenior:sos:v1:2:seen')).map(([id]) => id), [101, 102, 103]);
  } finally { f.controller.dispose(); }
});

test('SOS arriving while audio play is pending is included in the heard ledger', async () => {
  const playing = deferred(); const f = fixture({ play: () => playing.promise });
  try {
    f.enabled(); f.controller.receive(event(101)); await flush();
    f.controller.receive(event(102)); playing.resolve(); await flush();
    assert.equal(f.audios.length, 1); assert.equal(f.controller.getSnapshot().ringing, true);
    assert.deepEqual(JSON.parse(f.storage.getItem('caresenior:sos:v1:2:seen')).map(([id]) => id), [101, 102]);
  } finally { f.controller.dispose(); }
});

test('duplicate replay after disposal/reload does not ring even in a new controller', async () => {
  const f = fixture(); f.enabled(); f.controller.receive(event()); await flush(); f.controller.dispose(); await flush();
  const reload = fixture({ storage: f.storage, locks: f.locks });
  try {
    reload.configure(); assert.ok(reload.controller.receive(event())); await flush();
    assert.equal(reload.audios.length, 0);
  } finally { reload.controller.dispose(); }
});

test('two same-user tabs/connections race for one alarm and stop/mute cross-tab', async () => {
  const first = fixture(); const second = fixture({ storage: first.storage, locks: first.locks });
  try {
    first.enabled(); second.configure();
    assert.ok(first.controller.receive(event())); assert.ok(second.controller.receive(event())); await flush();
    assert.equal([...first.audios, ...second.audios].filter((a) => a.loop && a.plays).length, 1);
    second.controller.silence(); await flush();
    assert.equal(first.controller.getSnapshot().ringing, false); assert.equal(second.controller.getSnapshot().ringing, false);
    first.controller.receive(event(102)); second.controller.receive(event(102)); await flush();
    second.controller.disable(); await flush();
    assert.equal(first.controller.getSnapshot().enabled, false); assert.equal(first.controller.getSnapshot().ringing, false);
    first.controller.receive(event(103)); second.controller.receive(event(103)); await flush();
    assert.equal([...first.audios, ...second.audios].filter((a) => a.loop && a.plays).length, 2);
  } finally { first.controller.dispose(); second.controller.dispose(); }
});

test('autoplay denial is visible, preserves SOS and allows an explicit click to retry', async () => {
  let blocked = true;
  const f = fixture({ play: () => blocked ? Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve() });
  try {
    f.enabled(); assert.ok(f.controller.receive(event())); await flush();
  assert.equal(f.controller.getSnapshot().blocked, true); assert.match(f.controller.getSnapshot().error, /Trình duyệt.*chặn.*Cho phép âm thanh/);
    assert.equal(f.controller.getSnapshot().ringing, false);
    blocked = false; assert.equal(await f.controller.enable(), true); await flush();
    assert.equal(f.controller.getSnapshot().blocked, false); assert.equal(f.controller.getSnapshot().ringing, true);
  } finally { f.controller.dispose(); }
});

test('blocked first tab hands off the unconsumed SOS to an unlocked second tab', async () => {
  const first = fixture({ play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) });
  const second = fixture({ storage: first.storage, locks: first.locks });
  try {
    first.enabled(); second.configure();
    first.controller.receive(event()); second.controller.receive(event());
    await flush(); await flush();
    assert.equal(first.controller.getSnapshot().ringing, false);
    assert.equal(first.controller.getSnapshot().blocked, true);
    assert.equal(second.controller.getSnapshot().ringing, true);
    assert.equal(second.audios.filter((a) => a.loop && a.plays).length, 1);
    assert.equal(JSON.parse(first.storage.getItem('caresenior:sos:v1:2:seen')).length, 1);
  } finally { first.controller.dispose(); second.controller.dispose(); }
});

test('enable in a follower cannot replay an SOS that another tab already sounded', async () => {
  const first = fixture(); const second = fixture({ storage: first.storage, locks: first.locks });
  try {
    first.enabled(); second.configure();
    first.controller.receive(event()); second.controller.receive(event()); await flush();
    first.controller.silence(); await flush();
    // Emulate a follower that retained an event while the leader held the lock.
    second.configure(2, false); second.configure(2, true); second.controller.receive(event()); await flush();
    assert.equal(await second.controller.enable(), true); await flush();
    assert.equal(second.audios.filter((a) => a.loop).length, 0);
    assert.equal(second.controller.getSnapshot().ringing, false);
  } finally { first.controller.dispose(); second.controller.dispose(); }
});

test('all blocked tabs attempt once without an endless cross-tab handoff loop', async () => {
  const blocked = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  const first = fixture({ play: blocked }); const second = fixture({ storage: first.storage, locks: first.locks, play: blocked });
  try {
    first.enabled(); second.configure(); first.controller.receive(event()); second.controller.receive(event());
    await flush(); await flush(); await flush();
    assert.equal(first.audios.length, 1); assert.equal(second.audios.length, 1);
    assert.equal(first.controller.getSnapshot().blocked, true); assert.equal(second.controller.getSnapshot().blocked, true);
    assert.deepEqual(JSON.parse(first.storage.getItem('caresenior:sos:v1:2:seen')), []);
  } finally { first.controller.dispose(); second.controller.dispose(); }
});

test('network/codec audio errors are honest and never report ringing', async () => {
  const f = fixture({ play: () => Promise.reject(Object.assign(new Error('bad audio'), { name: 'NotSupportedError' })) });
  try {
    f.enabled(); f.controller.receive(event()); await flush();
    assert.equal(f.controller.getSnapshot().blocked, false); assert.equal(f.controller.getSnapshot().ringing, false);
    assert.match(f.controller.getSnapshot().error, /Không phát được âm thanh/);
  } finally { f.controller.dispose(); }
});

test('late successful play cannot restart after mute, logout, or account change', async () => {
  for (const action of ['disable', 'logout', 'switch']) {
    const play = deferred(); const f = fixture({ play: () => play.promise });
    try {
      f.enabled(); f.controller.receive(event()); await flush();
      if (action === 'disable') f.controller.disable();
      else f.configure(action === 'switch' ? 99 : 2, action === 'switch');
      play.resolve(); await flush();
      assert.equal(f.controller.getSnapshot().ringing, false); assert.ok(f.audios[0].pauses > 0);
    } finally { f.controller.dispose(); }
  }
});

test('no locks or blocked storage fails closed for sound but still returns SOS for visual UI', async () => {
  for (const options of [{ locks: null }, { storage: Object.assign(new Storage(), { blocked: true }) }]) {
    const f = fixture(options);
    try {
      f.configure(); assert.ok(f.controller.receive(event())); assert.equal(await f.controller.enable(), false); await flush();
      assert.equal(f.audios.length, 0); assert.equal(f.controller.getSnapshot().coordinationAvailable, false);
      assert.match(f.controller.getSnapshot().error, /SOS vẫn hiển thị/);
    } finally { f.controller.dispose(); }
  }
});

test('storage becoming unavailable before sound claim stops sound rather than risk duplicates', async () => {
  const f = fixture();
  try {
    f.enabled(); f.storage.blocked = true; assert.ok(f.controller.receive(event())); await flush();
    assert.equal(f.audios.length, 0); assert.equal(f.controller.getSnapshot().coordinationAvailable, false);
  } finally { f.controller.dispose(); }
});

test('resolved/unknown status never starts a fresh alarm', async () => {
  const f = fixture();
  try {
    f.enabled(); assert.ok(f.controller.receive(event(101, { trangThai: 'DA_XU_LY' })));
    assert.ok(f.controller.receive(event(102, { trangThai: 'OTHER' }))); await flush(); assert.equal(f.audios.length, 0);
  } finally { f.controller.dispose(); }
});

test('snapshot identity stays stable between updates; permission loss notifies and silences', async () => {
  const f = fixture(); let updates = 0;
  const unsubscribe = f.controller.subscribe(() => { updates++; });
  try {
    f.enabled(); const previous = f.controller.getSnapshot(); assert.equal(f.controller.getSnapshot(), previous);
    f.controller.receive(event()); await flush(); assert.equal(f.controller.getSnapshot().ringing, true);
    const before = updates; f.configure(2, false);
    assert.ok(updates > before); assert.equal(f.controller.getSnapshot().enabled, false); assert.equal(f.controller.getSnapshot().ringing, false);
    assert.equal(f.controller.receive(event(102)), null); assert.equal(await f.controller.enable(), false);
  } finally { unsubscribe(); f.controller.dispose(); }
});

test('SOS received while off then resolved does not ring when sound is enabled later', async () => {
  const f = fixture();
  try {
    f.configure(); f.controller.receive(event());
    const updated = f.controller.update({ id: 101, canhBaoId: 201, nguoiCaoTuoiId: 7, trangThai: 'DaXuLy' });
    assert.equal(updated.id, 101); assert.equal(updated.statusLabel, 'Đã xử lý');
    assert.equal(await f.controller.enable(), true); await flush();
    assert.equal(f.audios.length, 1); assert.equal(f.audios[0].loop, false); assert.equal(f.controller.getSnapshot().ringing, false);
    assert.deepEqual(JSON.parse(f.storage.getItem('caresenior:sos:v1:2:seen')).map(([id]) => id), [101]);
  } finally { f.controller.dispose(); }
});

test('resolving one of several SOS keeps the other unresolved alarm ringing', async () => {
  const f = fixture();
  try {
    f.enabled(); f.controller.receive(event(101)); f.controller.receive(event(102)); await flush();
    assert.equal(f.controller.getSnapshot().ringing, true);
    f.controller.update({ id: 101, canhBaoId: 201, nguoiCaoTuoiId: 7, trangThai: 'DA_XU_LY' });
    await flush(); assert.equal(f.controller.getSnapshot().ringing, true); assert.equal(f.audios[0].pauses, 0);
    const accepted = f.controller.update({ id: 102, canhBaoId: 202, trangThai: 'DaTiepNhan' });
    assert.equal(accepted.statusLabel, 'Đã tiếp nhận'); assert.equal(f.controller.getSnapshot().ringing, true);
    f.controller.update({ id: 202, canhBaoId: 202, nguoiCaoTuoiId: 7, trangThai: 'DaXuLy' });
    await flush(); assert.equal(f.controller.getSnapshot().ringing, false); assert.equal(f.controller.getSnapshot().enabled, true);
    assert.ok(f.audios[0].pauses > 0);
  } finally { f.controller.dispose(); }
});

test('health/unknown/mismatched updates cannot resolve or reinterpret a known SOS', async () => {
  const f = fixture();
  try {
    f.enabled(); f.controller.receive(event()); await flush();
    for (const update of [null, [], { id: 101, trangThai: 'DaXuLy' }, { canhBaoId: 999, trangThai: 'DaXuLy' },
      { canhBaoId: 201, nguoiCaoTuoiId: 999, trangThai: 'DaXuLy' }, { canhBaoId: 201, trangThai: 'OTHER' }]) {
      assert.equal(f.controller.update(update), null);
    }
    assert.equal(f.controller.getSnapshot().ringing, true);
    f.configure(2, false); assert.equal(f.controller.update({ canhBaoId: 201, trangThai: 'DaXuLy' }), null);
    f.configure(2, true); assert.equal(f.controller.update({ canhBaoId: 201, trangThai: 'DaXuLy' }), null);
  } finally { f.controller.dispose(); }
});

test('resolution cancels a late play result without disabling future SOS alarms', async () => {
  const first = deferred(); const f = fixture({ play: (_, count) => count === 1 ? first.promise : Promise.resolve() });
  try {
    f.enabled(); f.controller.receive(event()); await flush();
    f.controller.update({ canhBaoId: 201, trangThai: 'DaXuLy' }); first.resolve(); await flush();
    assert.equal(f.controller.getSnapshot().ringing, false); assert.ok(f.audios[0].pauses > 0);
    f.controller.receive(event(102)); await flush(); assert.equal(f.controller.getSnapshot().ringing, true);
  } finally { f.controller.dispose(); }
});
