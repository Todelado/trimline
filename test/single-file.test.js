'use strict';
// The single-file build has to be the same tool, not a copy that drifted. These tests build it and
// compare the inlined blocks against the real sources byte for byte.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { build, verify, PARTS } = require('../tools/build_single.js');

const ROOT = path.join(__dirname, '..');
const html = build();

test('the single file passes its own offline checks', () => {
  assert.deepEqual(verify(html), []);
});

test('every inlined block is byte-identical to the source the other tests cover', () => {
  for (const rel of PARTS) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const marker = '/* inlined from ' + rel + ' */\n';
    const start = html.indexOf(marker);
    assert.ok(start !== -1, 'no inlined block for ' + rel);
    const from = start + marker.length;
    const to = html.indexOf('\n</script>', from);
    assert.ok(to !== -1, 'unterminated block for ' + rel);
    assert.equal(html.slice(from, to), code, 'inlined ' + rel + ' differs from the source file');
  }
});

test('nothing is fetched and nothing is remote', () => {
  assert.ok(!/<script[^>]+src=/i.test(html), 'external script reference survived inlining');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(html));
  assert.ok(!/https?:\/\//.test(html), 'single file must not name a remote host');
});

test('the single file states the same engine version as package.json', () => {
  const version = require('../package.json').version;
  const hits = html.match(/version: '([0-9]+\.[0-9]+\.[0-9]+)'/g) || [];
  assert.equal(hits.length, 1, 'expected exactly one version literal, got ' + hits.length);
  assert.ok(hits[0].indexOf(version) !== -1, 'single file says ' + hits[0] + ', package says ' + version);
});

test('the page still has the controls the claims depend on', () => {
  for (const id of ['src', 'apply', 'undo', 'card', 'ruleset', 'budget']) {
    assert.ok(html.indexOf('id="' + id + '"') !== -1, 'missing #' + id);
  }
});

test('the committed trimline.html is not a stale copy of the source', () => {
  // a one-file build is the thing people download, so a committed copy that drifts from src/ is the
  // worst kind of bug: it looks current and behaves like an older tool
  const committed = path.join(ROOT, 'trimline.html');
  assert.ok(fs.existsSync(committed), 'trimline.html is not committed — run: node tools/build_single.js --out ./trimline.html');
  const fresh = build();
  assert.equal(fs.readFileSync(committed, 'utf8'), fresh,
    'committed trimline.html is older than src/ — rebuild it in the same commit');
});
