import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(loaded = true) {
  const configs = []; let cancels = 0, script;
  const sdk = { initialize: config => configs.push(config), renderButton: () => {}, cancel: () => { cancels++; }, disableAutoSelect: () => {} };
  const context = { window: loaded ? { google: { accounts: { id: sdk } } } : {}, document: { createElement: () => ({ remove() {} }), head: { appendChild: value => { script = value; } } }, setTimeout, clearTimeout };
  const source = fs.readFileSync(new URL('../src/services/googleWebService.js', import.meta.url), 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('let sdkPromise')).replace('export async function', 'async function') + '\nglobalThis.mount = mountGoogleWebButton;', context);
  return { context, configs, sdk, get script() { return script; }, get cancels() { return cancels; }, element: () => ({ clientWidth: 280, cleared: 0, replaceChildren() { this.cleared++; } }) };
}
const challenge = { clientId: '123-fixture.apps.googleusercontent.com', nonce: 'synthetic-nonce' };
test('GIS cleanup detaches credential handlers and ignores late callbacks after abort', async () => {
  const f = fixture(), controller = new AbortController(), element = f.element(); let replies = 0;
  const cleanup = await f.context.mount(element, challenge, () => { replies++; }, () => true, controller.signal);
  assert.equal(f.configs[0].nonce, challenge.nonce); assert.equal(f.configs[0].auto_select, false);
  f.configs[0].callback({ credential: 'synthetic' }); assert.equal(replies, 1);
  controller.abort(); cleanup(); f.configs[0].callback({ credential: 'late' });
  assert.equal(replies, 1); assert.equal(f.cancels, 1); assert.equal(element.cleared, 1);
});
test('cancelling while GIS script loads cannot initialize a stale account callback', async () => {
  const f = fixture(false), controller = new AbortController();
  const pending = f.context.mount(f.element(), challenge, () => { throw Error('stale callback'); }, () => true, controller.signal);
  controller.abort(); f.context.window.google = { accounts: { id: f.sdk } }; f.script.onload(); await pending;
  assert.equal(f.configs.length, 0);
});
test('cleanup of an older GIS owner cannot cancel or clear a newer button', async () => {
  const f = fixture(), older = f.element(), newer = f.element(); let replies = 0;
  const a = await f.context.mount(older, challenge, () => { throw Error('old owner'); });
  const b = await f.context.mount(newer, challenge, () => { replies++; });
  a(); f.configs[0].callback({ credential: 'late' }); f.configs[1].callback({ credential: 'current' });
  assert.equal(replies, 1); assert.equal(f.cancels, 0); assert.equal(newer.cleared, 0); b(); assert.equal(f.cancels, 1);
});
