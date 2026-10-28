import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = readFileSync(new URL('../src/pages/ElderlyPortal/ElderlyPortal.css', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/pages/ElderlyPortal/ElderlyAssistant.css', import.meta.url), 'utf8');
const token = name => sheet.match(new RegExp(`--cs-${name}:\\s*(#[a-f0-9]{6})`, 'i'))?.[1];
const luminance = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
  .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('workspace readable color pairs meet normal-text contrast and retain the requested brand', () => {
  assert.equal(token('primary'), '#21966f'); assert.equal(token('deep'), '#155e4b');
  assert.equal(token('mint'), '#e8f6ef'); assert.equal(token('bg'), '#f7faf8');
  for (const [fg, bg] of [[token('ink'), token('bg')], [token('muted'), token('surface')], ['#ffffff', token('deep')], [token('amber'), token('amber-bg')], ['#a8243b', token('danger-bg')]]) {
    assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
  }
  assert.ok(contrast(token('input-line'), token('surface')) >= 3);
});

test('NCT styles cannot introduce a global selector or an external font request', () => {
  for (const css of [sheet, chat]) {
    assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/i);
    const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector] of cleaned.matchAll(/([^{}]+)\{/g)) {
      if (selector.trim().startsWith('@')) continue;
      assert.match(selector.trim(), /^\.elderly-/, selector);
    }
  }
});
