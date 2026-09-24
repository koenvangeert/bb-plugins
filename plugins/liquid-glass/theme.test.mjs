import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

test('contributes one locally packaged theme without a frontend or injected skills', () => {
  assert.equal(manifest.bb.themes.length, 1);
  assert.equal(manifest.bb.themes[0].id, 'pearl');
  assert.equal(manifest.bb.app, undefined);
  assert.deepEqual(manifest.bb.skills, []);
  for (const path of [manifest.bb.server, manifest.bb.themes[0].css]) {
    assert.ok(existsSync(new URL(path, import.meta.url)), path);
  }
});

test('theme contains light and dark tokens and progressive fallback rules', () => {
  const css = readFileSync(new URL('./themes/pearl.css', import.meta.url), 'utf8');
  for (const token of ['--canvas:', '--ink:', '--lg-wallpaper:', '--lg-material:']) {
    assert.ok(css.includes(token), token);
  }
  for (const rule of ['.dark', '@supports', 'prefers-reduced-transparency: reduce', 'forced-colors: active']) {
    assert.ok(css.includes(rule), rule);
  }
  assert.doesNotMatch(css, /https?:|@import|url\(|animation\s*:|transition\s*:|filter\s*:\s*url/i);
});

test('host integration targets documented component attributes rather than all cards', () => {
  const css = readFileSync(new URL('./themes/pearl.css', import.meta.url), 'utf8');
  for (const selector of ['[data-sidebar="panel"]', '[data-promptbox]', '[data-testid="app-page-header-content-row"]', '[data-persistent-drawer-content]']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.doesNotMatch(css, /nth-child|nth-of-type|\.bg-card\s*\{/);
});

test('CSS parses with opaque baseline and accessible body text in both modes', () => {
  const css = readFileSync(new URL('./themes/pearl.css', import.meta.url), 'utf8');
  const root = postcss.parse(css);
  const luminance = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255);
    const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const selector of [':root, .light', '.dark']) {
    const rule = root.nodes.find(n => n.type === 'rule' && n.selector === selector);
    const tokens = Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]));
    assert.match(tokens['--lg-material'], /^#[a-f\d]{6}$/i);
    for (const name of ['--ink', '--muted-foreground', '--subtle-foreground']) {
      const a = luminance(tokens[name]), b = luminance(tokens['--lg-content']);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${selector} ${name}`);
    }
  }
  const reduced = root.nodes.find(n => n.type === 'atrule' && n.params === '(prefers-reduced-transparency: reduce)');
  assert.ok(reduced.toString().includes('--lg-blur: none'));
  root.walkDecls('filter', () => assert.fail('Foreground filtering would distort content'));
});
