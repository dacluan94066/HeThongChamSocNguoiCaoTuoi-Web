import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { normalizeSos, formatSosTime, SOS_AUDIO_SRC } from '../src/utils/sosAlarm.js';

// Execute the production hook with dependency-injected React effects/socket/UI.
// No HTTP, token, browser profile, SQL connection or actual SOS is used.
function mount({ allowed = true, userId = 502, loading = false } = {}) {
  const socket = new EventEmitter();
  const effects = [], notices = [], destroyed = [], routes = [], changes = [], calls = [];
  const seen = new Set();
  let authorized = false;
  let updateResult = null;
  const alarm = {
    configure(scope) { authorized = scope.authorized; calls.push(['configure', scope]); },
    receive(alert) { const sos = normalizeSos(alert); if (!authorized || !sos || seen.has(sos.id)) return null; seen.add(sos.id); calls.push(['receive', sos.id]); return sos; },
    update(alert) { calls.push(['update', alert]); return updateResult; },
    enable() { calls.push(['enable']); }, disable() { calls.push(['disable']); }, silence() { calls.push(['silence']); },
    subscribe() { return () => {}; }, getSnapshot() { return { enabled: false, ringing: false }; },
  };
  const context = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useEffect: (fn) => effects.push(fn), useMemo: (fn) => fn(), useRef: (value) => ({ current: value }),
    useSyncExternalStore: (_subscribe, get) => get(),
    App: { useApp: () => ({ notification: {
      error: (options) => notices.push({ type: 'error', ...options }),
      warning: (options) => notices.push({ type: 'warning', ...options }),
      destroy: (key) => destroyed.push(key),
    } }) }, Button: 'Button', Space: 'Space', useNavigate: () => (path) => routes.push(path),
    useAuth: () => ({ user: userId ? { userId } : null, hasPermission: () => allowed,
      permissionsLoading: loading, authLoading: false }),
    getSocket: () => socket, getSosAlarmController: () => alarm, normalizeSos, formatSosTime,
  };
  const source = fs.readFileSync(new URL('../src/hooks/useRealtimeAlerts.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default useRealtimeAlerts;', 'globalThis.run = useRealtimeAlerts;');
  vm.runInNewContext(source, context);
  const returned = context.run((alert) => changes.push(alert));
  const cleanup = effects.map((fn) => fn()).filter(Boolean);
  return { socket, notices, destroyed, routes, changes, calls, returned,
    setUpdateResult: (value) => { updateResult = value; }, unmount: () => cleanup.forEach((fn) => fn()) };
}
const sos = { id: 201, canhBaoId: 201, canhBaoKhanCapId: 101, nguonBang: 'CanhBaoKhanCap',
  nguonId: 101, nguoiCaoTuoiTen: 'NCT fixture', ngayGui: '2026-10-23T10:11:12',
  trangThai: 'CHUA_XU_LY', moTa: 'Nội dung fixture' };

test('production hook routes confirmed SOS fixture to alarm + prominent name/time/status notice', () => {
  const f = mount();
  f.socket.emit('canhbao:new', sos);
  assert.equal(f.notices.length, 1);
  const notice = f.notices[0];
  assert.equal(notice.duration, 0);
  assert.match(notice.title, /SOS.*NCT fixture/);
  assert.match(JSON.stringify(notice.description), /10:11:12/);
  assert.match(JSON.stringify(notice.description), /Chưa xử lý/);
  assert.ok(f.calls.some(([name, id]) => name === 'receive' && id === 101));
  assert.equal(f.changes.length, 1);
  f.unmount();
});
test('silencing only stops sound; detail uses existing SOS route, neither changes server state', () => {
  const f = mount(); f.socket.emit('canhbao:new', sos);
  const [detail, silence] = f.notices[0].actions.props.children;
  silence.props.onClick();
  assert.equal(f.calls.filter(([name]) => name === 'silence').length, 1);
  assert.equal(f.routes.length, 0);
  detail.props.onClick();
  assert.deepEqual(f.routes, ['/canh-bao?tab=sos&highlight=201']);
  assert.equal(f.destroyed.length, 1);
  f.unmount();
});
test('replayed event after reconnect creates neither duplicate notice nor receive action', () => {
  const f = mount();
  f.socket.emit('canhbao:new', sos); f.socket.emit('connect'); f.socket.emit('canhbao:new', sos);
  assert.equal(f.notices.length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'receive').length, 1);
  f.unmount();
});
test('known SOS status update refreshes the same notice without generating another alarm', () => {
  const f = mount(); f.socket.emit('canhbao:new', sos);
  f.setUpdateResult({ ...normalizeSos(sos), status: 'DaXuLy', statusLabel: 'Đã xử lý' });
  f.socket.emit('canhbao:updated', { canhBaoId: 201, trangThai: 'DaXuLy' });
  assert.equal(f.notices.length, 2);
  assert.equal(f.notices[0].key, f.notices[1].key);
  assert.match(JSON.stringify(f.notices[1].description), /Đã xử lý/);
  assert.equal(f.calls.filter(([name]) => name === 'receive').length, 1);
  f.unmount();
});
test('ordinary alert and severe health alert retain notices/counters and never enter SOS alarm', () => {
  const f = mount();
  f.socket.emit('canhbao:new', { id: 9, moTa: 'Chỉ số', nguonBang: 'ChiSoSucKhoe', mucDo: 'KHAN_CAP' });
  f.socket.emit('canhbao:new', { id: 10, moTa: 'Cảnh báo thường', mucDo: 'CAO' });
  f.socket.emit('canhbao:updated', { id: 10 });
  assert.deepEqual(f.notices.map((n) => n.type), ['error', 'warning']);
  assert.equal(f.calls.filter(([name]) => name === 'receive').length, 0);
  assert.equal(f.changes.length, 3);
  f.unmount();
});
for (const options of [{ allowed: false }, { userId: null }, { loading: true }]) {
  test(`no SOS data/audio while unauthorized or session permissions pending ${JSON.stringify(options)}`, () => {
    const f = mount(options); f.socket.emit('canhbao:new', sos); f.socket.emit('canhbao:updated', sos);
    assert.equal(f.notices.length, 0); assert.equal(f.changes.length, 0);
    assert.equal(f.calls.filter(([name]) => name === 'receive').length, 0);
    f.unmount();
  });
}
test('malformed SOS cannot fall through to app notification; cleanup removes listeners and scope', () => {
  const f = mount(); f.socket.emit('canhbao:new', { ...sos, canhBaoKhanCapId: -1, nguonId: -1 });
  assert.equal(f.notices.length, 0);
  f.socket.emit('canhbao:new', sos); f.unmount();
  assert.equal(f.socket.listenerCount('canhbao:new'), 0);
  assert.equal(f.socket.listenerCount('canhbao:updated'), 0);
  assert.equal(f.calls.at(-1)[1].authorized, false);
  assert.equal(f.destroyed.length, 1);
});
test('selected local MP3 is the exact user-provided SOS audio, without a remote dependency', () => {
  assert.equal(SOS_AUDIO_SRC, '/audio/sos-bip-bip.mp3');
  const mp3 = fs.readFileSync(new URL(`../public${SOS_AUDIO_SRC}`, import.meta.url));
  assert.equal(mp3.toString('ascii', 0, 3), 'ID3');
  assert.equal(mp3.length, 1296002);
  assert.equal(createHash('sha256').update(mp3).digest('hex'),
    'a14fda8c1c39832bce47c25e7dfa725f9490f5e4f18ee89b603b977d6282c19a');
});
