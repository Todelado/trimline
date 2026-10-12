'use strict';
/* Claims the posts make about this tool, turned into tests.
   "zero network calls" and "open the page and the tool is complete" are falsifiable
   statements, so they belong here rather than in prose. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'index.html');
const JS_FILES = ['src/rules.js', 'src/app.js'].map(f => path.join(ROOT, f));
const ALL = [PAGE].concat(JS_FILES);

function read(f) { return fs.readFileSync(f, 'utf8'); }

test('no network APIs are referenced anywhere in the shipped page', () => {
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/,
    /navigator\.sendBeacon/, /new\s+Worker/, /importScripts/, /<iframe/, /<script[^>]+src=["']https?:/];
  ALL.forEach(function (f) {
    const src = read(f);
    forbidden.forEach(function (re) {
      assert.ok(!re.test(src), path.basename(f) + ' must not contain ' + re);
    });
  });
});

test('no remote URLs are referenced, so the offline claim holds', () => {
  ALL.forEach(function (f) {
    const src = read(f);
    const hits = src.match(/https?:\/\/[^\s"'<>)]+/g) || [];
    assert.deepEqual(hits, [], path.basename(f) + ' references remote URLs: ' + hits.join(', '));
  });
});

test('every local asset the page references exists on disk', () => {
  const refs = (read(PAGE).match(/(?:src|href)=["']([^"']+)["']/g) || [])
    .map(function (m) { return m.replace(/^(?:src|href)=["']/, '').replace(/["']$/, ''); })
    .filter(function (u) { return !/^(#|https?:|data:|mailto:)/.test(u); });
  assert.ok(refs.length >= 2, 'expected the page to reference rules.js and app.js');
  refs.forEach(function (u) {
    assert.ok(fs.existsSync(path.join(ROOT, u)), 'missing local asset: ' + u);
  });
});

test('the page works from a file path: no absolute paths, no build step', () => {
  const src = read(PAGE);
  const abs = (src.match(/(?:src|href)=["']\/[^"']+/g) || []);
  assert.deepEqual(abs, [], 'absolute paths would break file:// and subfolders: ' + abs.join(', '));
});

test('the rules engine has no node-only globals, so the browser build is the same code', () => {
  const src = read(path.join(ROOT, 'src', 'rules.js'));
  assert.ok(!/\brequire\s*\(/.test(src.replace(/typeof module[\s\S]*?module\.exports[^;]*;/g, '')) ||
    /typeof module/.test(src), 'require() must stay behind a module check');
  assert.ok(!/\bprocess\./.test(src), 'rules.js must not touch process');
  assert.ok(!/\bfs\b/.test(src), 'rules.js must not read the filesystem');
});

test('version is stated in exactly one place', () => {
  const rules = read(path.join(ROOT, 'src', 'rules.js'));
  const m = rules.match(/version:\s*'([\d.]+)'/g) || [];
  assert.equal(m.length, 1, 'version strings found: ' + m.join(', '));
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const engine = rules.match(/version:\s*'([\d.]+)'/)[1];
  assert.equal(pkg.version, engine, 'package.json (' + pkg.version + ') must match the engine (' + engine + ')');
});
