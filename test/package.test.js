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
const Trimline = require('../src/rules.js');

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

test('app code names no remote host at all', () => {
  // the engine and the UI logic must not know how to reach anything: no host string to dial
  JS_FILES.forEach(function (f) {
    const hits = read(f).match(/https?:\/\/[^\s"'<>)]+/g) || [];
    assert.deepEqual(hits, [], path.basename(f) + ' references remote URLs: ' + hits.join(', '));
  });
});

test('the page may only name a remote host inside an <a href> a person chooses to click', () => {
  // The claim is "the page makes no network calls", not "contains no string with http in it".
  // A link is not a request. Everything that *is* a request stays banned: src, srcset, action,
  // poster, and the network APIs above. Remove the anchors and no host may survive.
  const src = read(PAGE);
  const withoutAnchors = src.replace(/<a\b[^>]*>/gi, '');
  const leaks = withoutAnchors.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(leaks, [], 'page loads or posts to a remote host: ' + leaks.join(', '));
  const attrs = (src.match(/(?:src|srcset|action|formaction|poster|data)\s*=\s*["'][^"']*["']/g) || [])
    .filter(function (a) { return /https?:\/\//.test(a); });
  assert.deepEqual(attrs, [], 'a loading attribute points off-machine: ' + attrs.join(', '));
  assert.ok(!/href\s*=\s*["']javascript:/i.test(src), 'javascript: href is not a link, it is code');
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

test('the page\'s own prose obeys its own rules', () => {
  // a linter whose interface contains the sloppiness it flags has lost the argument
  const html = fs.readFileSync(PAGE, 'utf8');
  const strings = (html.match(/>([^<>{}]{25,})</g) || [])
    .map(function (m) { return m.slice(1, -1).replace(/\s+/g, ' ').trim(); })
    .filter(function (t) { return !/var |function |const |=>/.test(t); });
  assert.ok(strings.length >= 5, 'expected to find UI prose to check, got ' + strings.length);
  // long-sentence is excluded on purpose: UI prose is fragments and labels, not paragraphs
  const offenders = [];
  strings.forEach(function (t) {
    Trimline.analyze(t).issues.forEach(function (i) {
      if (i.rule !== 'long-sentence') offenders.push(i.rule + ' in "' + t.slice(0, 60) + '"');
    });
  });
  assert.deepEqual(offenders, [], 'UI copy trips its own rules: ' + offenders.join('; '));
});

test('link previews get real metadata, and the preview image is a file in this repo', () => {
  const src = read(PAGE);
  const meta = function (key) {
    const re = new RegExp('<meta[^>]+(?:property|name)="[^"]*' + key + '"[^>]+content="([^"]*)"', 'i');
    const rev = new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="[^"]*' + key + '"', 'i');
    const m = src.match(re) || src.match(rev);
    return m ? m[1] : null;
  };
  assert.ok(meta('og:title'), 'og:title missing — a shared link renders as a bare URL');
  assert.ok(meta('og:description'), 'og:description missing');
  assert.equal(meta('twitter:card'), 'summary_large_image', 'twitter:card must ask for the large image');
  const img = meta('og:image');
  assert.ok(img, 'og:image missing — preview has no image');
  assert.ok(!/^https?:/i.test(img), 'og:image must stay relative so the page has no host dependency: ' + img);
  assert.ok(fs.existsSync(path.join(ROOT, img)), 'og:image names a file that is not in the repo: ' + img);
  // any count in the preview copy has to come from the engine, not from whoever wrote the sentence:
  // a stale "79 tests" already shipped once in a post, and metadata rots the same way
  const desc = meta('og:description');
  const claimed = (desc.match(/(\d+)\s+(?:phrase\s+)?rules/gi) || [])
    .map(function (m) { return parseInt(m, 10); });
  claimed.forEach(function (n) {
    assert.equal(n, Trimline.PHRASES.length,
      'preview copy claims ' + n + ' rules; the engine has ' + Trimline.PHRASES.length);
  });
  const tests = desc.match(/\d+\s+tests/i);
  assert.ok(!tests, 'do not put a test count in page metadata: ' + (tests && tests[0]));
});
