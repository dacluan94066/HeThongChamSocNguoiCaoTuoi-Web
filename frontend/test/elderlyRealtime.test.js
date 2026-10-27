import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { subscribeElderlyRealtime, LIVE_TOPICS, resourceTopic } from '../src/utils/elderlyRealtime.js';

function fixture() {
  const socket = new EventEmitter(), browser = new EventEmitter(), document = new EventEmitter();
  for (const el of [browser, document]) { el.addEventListener = el.on.bind(el); el.removeEventListener = el.off.bind(el); }
  document.visibilityState = 'visible'; let current = true, next = 0;
  const timers = new Map(), changes = [], connections = [];
  const bridge = subscribeElderlyRealtime({ socket, browser, document, userId: 7, profileId: 42, canAlerts: true, current: () => current,
    onChange: topics => changes.push(topics), onConnection: status => connections.push(status), schedule: fn => { timers.set(++next, fn); return next; }, unschedule: id => timers.delete(id) });
  return { socket, browser, document, bridge, changes, connections, expire() { current = false; }, flush() { for (const fn of timers.values()) fn(); timers.clear(); } };
}
test('owner notifications/events are debounced and deduplicated; payloads never render data directly', () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) f.socket.emit('thongbao:new', { id: 5 });
  f.flush(); assert.deepEqual(f.changes, [['notifications']]);
  f.socket.emit('thongbao:new', { id: 5 }); f.flush(); assert.equal(f.changes.length, 1);
  f.socket.emit('canhbao:new', { id: 6, nguoiCaoTuoiId: 42 }); f.flush(); assert.deepEqual(f.changes[1], ['alerts', 'sos']);
});
test('foreign elderly/account, invalid IDs and unscoped alert data cannot trigger private refreshes', () => {
  const f = fixture();
  f.socket.emit('canhbao:new', { id: 1, nguoiCaoTuoiId: 999 }); f.socket.emit('canhbao:new', { id: 1 });
  f.socket.emit('thongbao:new', { id: 1, userId: 999 }); f.socket.emit('thongbao:new', { id: -1 });
  f.socket.emit('lichuongthuoc:updated', { id: 1, nguoiCaoTuoiId: 999 }); f.flush(); assert.deepEqual(f.changes, []);
});
test('reconnect and foreground only reconcile GET data, hidden pages defer, session changes/disposal remove listeners', () => {
  const f = fixture(); f.socket.emit('connect'); f.flush(); assert.deepEqual(f.changes[0], LIVE_TOPICS);
  f.document.visibilityState = 'hidden'; f.socket.emit('thongbao:new', { id: 9 }); f.flush(); assert.equal(f.changes.length, 1);
  f.document.visibilityState = 'visible'; f.document.emit('visibilitychange'); f.flush(); assert.deepEqual(f.changes[1].sort(), [...LIVE_TOPICS].sort());
  f.expire(); f.socket.emit('thongbao:new', { id: 10 }); f.browser.emit('focus'); f.flush(); assert.equal(f.changes.length, 2);
  f.bridge.dispose(); assert.equal(f.socket.eventNames().length, 0); assert.equal(f.browser.eventNames().length, 0); assert.equal(f.document.eventNames().length, 0);
});
test('existing resource keys map to revisions without changing medication/appointment/health business rules', () => {
  assert.equal(resourceTopic('home-health:42'), 'health'); assert.equal(resourceTopic('doses:42:2026-10-27'), 'medications');
  assert.equal(resourceTopic('visits:42'), 'appointments'); assert.equal(resourceTopic('sos-history:42'), 'sos');
  assert.equal(resourceTopic('unknown'), undefined);
});
test('a brief offline interval restores connection status on foreground even when the same socket never disconnected', () => {
  const f = fixture(); f.socket.connected = true;
  f.browser.emit('offline'); assert.equal(f.connections.at(-1), 'offline');
  f.browser.emit('online'); assert.equal(f.connections.at(-1), 'connected');
  f.flush(); assert.deepEqual(f.changes[0], LIVE_TOPICS); f.bridge.dispose();
});
