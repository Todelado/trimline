#!/usr/bin/env node
// Build a single self-contained trimline.html: the page with src/rules.js and src/app.js inlined.
//
// Why: "open the page and the tool is complete" should not depend on a folder next to it. One file
// can be mailed, kept in a repo, dropped on any static host, or opened straight from disk with no
// server at all. The inlined blocks are compared byte-for-byte against the real sources by a test,
// so the single file cannot drift from the code the tests cover.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTS = ['src/rules.js', 'src/app.js'];

function build() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const rel of PARTS) {
    const tag = '<script src="' + rel + '"></script>';
    if (html.indexOf(tag) === -1) {
      throw new Error('expected tag not found in index.html: ' + tag);
    }
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // "</script" inside a string in the source would close the block early. Nothing in the engine
    // writes that today, but the guard is cheap and it is the one way inlining can silently corrupt.
    if (/<\/script/i.test(code)) {
      throw new Error('refusing to inline ' + rel + ': contains a closing script tag');
    }
    // A replacer function, not a string: with a string replacement, any $& / $` / $' inside the
    // inlined code is expanded by String.replace, which silently injects text from the page.
    html = html.replace(tag, function () {
      return '<script>\n/* inlined from ' + rel + ' */\n' + code + '\n</script>';
    });
  }
  return html;
}

function verify(html) {
  const problems = [];
  if (/<script[^>]+src=/i.test(html)) problems.push('still references an external script');
  if (/<link[^>]+href=["']https?:/i.test(html)) problems.push('references a remote stylesheet');
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(html)) {
    problems.push('contains a network API');
  }
  // a link a person clicks is not a request the page makes; strip anchors before asking who is remote
  const noAnchors = html.replace(/<a\b[^>]*>/gi, '');
  if (/https?:\/\//.test(noAnchors)) problems.push('names a remote host outside an <a href>');
  const loaders = (html.match(/(?:src|srcset|action|formaction|poster)\s*=\s*["'][^"']*["']/gi) || [])
    .filter(function (a) { return /https?:\/\//.test(a); });
  if (loaders.length) problems.push('loading attribute points off-machine: ' + loaders.join(', '));
  for (const rel of PARTS) {
    if (html.indexOf('inlined from ' + rel) === -1) problems.push('missing inlined block: ' + rel);
  }
  return problems;
}

if (require.main === module) {
  const html = build();
  const problems = verify(html);
  if (problems.length) {
    console.error('single-file build refused:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  // --out PATH so the bundle build can produce it as part of the same run; a single file written by a
  // different tool at a different time is exactly how a stale copy ends up shipped.
  const arg = process.argv.indexOf('--out');
  const out = arg !== -1 ? path.resolve(process.argv[arg + 1])
    : path.join(ROOT, '..', '..', 'artifacts', 'dist', 'trimline-single', 'trimline.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(out + '  (' + Buffer.byteLength(html) + ' bytes)');
}

module.exports = { build: build, verify: verify, PARTS: PARTS };
