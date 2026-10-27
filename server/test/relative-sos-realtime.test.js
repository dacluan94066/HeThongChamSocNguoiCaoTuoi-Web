const test = require('node:test');
const assert = require('node:assert/strict');
const { io: client } = require('socket.io-client');
const { createFixture } = require('./fixtures/relative-sos-fixture.cjs');
const { createRelativeRealtime } = require('../src/services/relativeRealtime.service');
const { createRelativeReadRepository } = require('../src/services/relativeRead.repository');
const pause = () => new Promise(resolve => setTimeout(resolve, 80));
async function connect(f, origin, id) {
  const socket = client(origin, { auth: { token: f.token(id) }, transports: ['websocket'], reconnection: false });
  const events = [];
  socket.on('canhbao:new', data => events.push(data));
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('fixture connect timeout')), 3000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); }); socket.once('connect_error', error => { clearTimeout(timer); reject(error); }); });
  return { socket, events };
}
const replay = (f, row, event = 'canhbao:new') => createRelativeRealtime(f.pool, f.sql, f.sockets.emitToUser)
  .emitSos(row.elderlyId, { nguoiCaoTuoiId: row.elderlyId, canhBaoKhanCapId: row.id, nguonBang: 'CanhBaoKhanCap',
    nguoiCaoTuoiTen: 'PRIVATE_FORGED_NAME', moTa: 'PRIVATE_GPS', viDo: 99, kinhDo: 99, ghiChuXuLy: 'PRIVATE_INTERNAL' }, event);

test('real isolated Socket.IO: Mobile HTTP -> committed SOS -> Admin/caregiver/family with separate payloads', async () => {
  const f = createFixture(), origin = await f.start(), clients = [];
  try {
    for (const id of [1, 2, 10, 11, 12, 14]) clients.push({ id, ...await connect(f, origin, id) });
    const result = await fetch(`${origin}/api/emergency-alerts`, { method: 'POST', headers: { Authorization: `Bearer ${f.token(3)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ noiDung: 'PRIVATE_MOBILE_CONTENT', viDo: 10.75, kinhDo: 106.67 }) });
    assert.equal(result.status, 201); const body = await result.json(); assert.equal(body.data.soNguoiChamSocNhan, 1);
    await pause();
    for (const id of [1, 2, 10, 11]) assert.equal(clients.find(c => c.id === id).events.length, 1, `authorized recipient ${id}`);
    for (const id of [12, 14]) assert.equal(clients.find(c => c.id === id).events.length, 0);
    for (const id of [10, 11]) {
      const data = clients.find(c => c.id === id).events[0];
      assert.equal(data.nguoiCaoTuoiTen, 'NCT fixture An'); assert.equal(data.nguonBang, 'CanhBaoKhanCap');
      assert.doesNotMatch(JSON.stringify(data), /PRIVATE|viDo|kinhDo|ghiChu|google|maps|diaChi/);
    }
    assert.equal(clients.find(c => c.id === 1).events[0].viDo, 10.75);
    assert.equal(clients.find(c => c.id === 2).events[0].noiDung, 'PRIVATE_MOBILE_CONTENT');
    assert.ok(f.state.committed > 0); assert.equal(f.state.errors.length, 0);
  } finally { for (const c of clients) c.socket.close(); await f.stop(); }
});

test('live revocation denies old open sockets and stored notifications, preserving another NCT', async () => {
  const f = createFixture(), origin = await f.start(), a = await connect(f, origin, 10), b = await connect(f, origin, 11);
  try {
    await f.send(3); await pause(); assert.equal(a.events.length, 1); assert.equal(b.events.length, 1);
    const repo = createRelativeReadRepository(f.pool, f.sql);
    assert.equal((await repo.notifications(10)).length, 1);
    f.revoke(10, 7); await replay(f, f.state.sos[0]); await pause();
    assert.equal(a.events.length, 1, 'already-open user room must not be sufficient'); assert.equal(b.events.length, 2);
    assert.equal((await repo.notifications(10)).length, 0);
    await assert.rejects(repo.read(10, 7, 'sos'), e => e.status === 403);
    await f.send(4); await pause(); assert.equal(a.events.at(-1).nguoiCaoTuoiId, 8);
    assert.equal((await repo.notifications(10)).length, 1);
    a.socket.disconnect(); a.socket.connect(); await new Promise(resolve => a.socket.once('connect', resolve));
    await replay(f, f.state.sos[0]); await pause(); assert.equal(a.events.length, 2, 'reconnect does not restore revoked rights');
  } finally { a.socket.close(); b.socket.close(); await f.stop(); }
});

test('fresh check immediately before emit rejects a revocation that happened after recipient selection', async () => {
  const f = createFixture();
  try {
    f.state.revokeBeforeEmit = 10; await f.send(3);
    assert.equal(f.state.events.some(e => e.userId === 10 && e.event === 'canhbao:new'), false);
    assert.equal(f.state.events.some(e => e.userId === 11 && e.event === 'canhbao:new'), true);
    assert.equal((await createRelativeReadRepository(f.pool, f.sql).notifications(10)).length, 0);
  } finally { await f.stop(); }
});

for (const [description, change] of [
  ['consent withdrawn', f => { f.links.find(l => l.userId === 10 && l.elderlyId === 7).consent = false; }],
  ['account locked', f => { f.accounts.find(a => a.id === 10).active = false; }],
  ['role changed', f => { f.accounts.find(a => a.id === 10).role = 'NguoiCaoTuoi'; }],
  ['alert-view permission removed', f => { f.accounts.find(a => a.id === 10).permission = false; }],
]) test(`family emission and history fail closed when ${description}`, async () => {
  const f = createFixture();
  try {
    await f.send(3); const row = f.state.sos[0]; change(f); f.state.events.length = 0;
    const emit = createRelativeRealtime(f.pool, f.sql, (userId, event, data) => f.state.events.push({ userId, event, data }));
    await emit.emitSos(7, { nguoiCaoTuoiId: 7, canhBaoKhanCapId: row.id, nguonBang: 'CanhBaoKhanCap' });
    assert.equal(f.state.events.some(e => e.userId === 10), false); assert.equal(f.state.events.some(e => e.userId === 11), true);
    assert.equal((await createRelativeReadRepository(f.pool, f.sql).notifications(10)).length, 0);
  } finally { await f.stop(); }
});

test('duplicate family delivery persists a single safe notification for each pair', async () => {
  const f = createFixture();
  try {
    await f.send(3); await Promise.all([replay(f, f.state.sos[0]), replay(f, f.state.sos[0])]);
    for (const id of [10, 11]) {
      const saved = f.state.notifications.filter(n => n.userId === id);
      assert.equal(saved.length, 1); assert.doesNotMatch(JSON.stringify(saved), /PRIVATE|google|maps/);
    }
  } finally { await f.stop(); }
});

test('SOS updates resolve the original SOS from the linked alert and re-read status, not caller fields', async () => {
  const f = createFixture();
  try {
    await f.send(3); const row = f.state.sos[0]; row.trangThai = 'DaXuLy'; f.state.events.length = 0;
    await f.notifications.emitSosAlertUpdate(7, { canhBaoId: row.alertId, trangThai: 'PRIVATE_FORGED_STATUS', moTa: 'PRIVATE_GPS' });
    const relatives = f.state.events.filter(e => [10, 11].includes(e.userId));
    assert.equal(relatives.length, 2); assert.equal(relatives.every(e => e.event === 'canhbao:updated' && e.data.trangThai === 'DaXuLy'), true);
    assert.doesNotMatch(JSON.stringify(relatives), /PRIVATE/);
  } finally { await f.stop(); }
});

test('unpatched database skips only family delivery and keeps accepted Mobile SOS and staff notifications', async () => {
  const f = createFixture();
  try {
    f.state.schema = false; const res = await f.send(3);
    assert.equal(res.statusCode, 201); assert.equal(f.state.events.some(e => e.userId === 1), true);
    assert.equal(f.state.events.some(e => e.userId === 2), true); assert.equal(f.state.events.some(e => e.userId >= 10), false);
    assert.equal(f.state.errors.length, 0);
  } finally { await f.stop(); }
});

test('ordinary events and spoofed source/elderly IDs cannot use the family SOS emitter', async () => {
  const f = createFixture();
  try {
    const emit = createRelativeRealtime(f.pool, f.sql, () => assert.fail('No emission expected'));
    await assert.rejects(emit.emitSos(7, { nguoiCaoTuoiId: 7, nguonBang: 'ChiSoSucKhoe', canhBaoKhanCapId: 101 }));
    await assert.rejects(emit.emitSos(7, { nguoiCaoTuoiId: 8, nguonBang: 'CanhBaoKhanCap', canhBaoKhanCapId: 101 }));
    assert.equal(f.state.notifications.length, 0);
  } finally { await f.stop(); }
});
