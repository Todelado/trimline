'use strict';
/* CLI-level tests: the command line had none, and it is the entry point people actually type. */
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CLI = path.join(__dirname, '..', 'src', 'cli.js');

function run(args, opts) {
  const r = spawnSync(process.execPath, [CLI].concat(args), Object.assign({ encoding: 'utf8' }, opts || {}));
  return r;
}

test('--help exits 0 and lists the budgets', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /x-post/);
  assert.match(r.stdout, /Trimline/);
});

test('reads a file and reports budget fit', () => {
  const f = path.join(os.tmpdir(), 'trimline-test-' + process.pid + '.txt');
  fs.writeFileSync(f, 'In order to prove this works, we made a decision to test the command line.\n');
  const r = run([f, '-b', 'x-post']);
  fs.unlinkSync(f);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /budget X post: \d+\/280  fits/);
  assert.match(r.stdout, /in order to  \(safe\)/);
});

test('stdin marker works when piped', () => {
  const r = run(['-', '-b', 'subject', '--out', '-'], { input: 'In order to check stdin, we shipped a guard.\n' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'To check stdin, we shipped a guard.\n', 'stdout stays clean for piping');
  assert.match(r.stderr, /budget Email subject/);
});

test('--json emits parseable numbers', () => {
  const r = run(['--json'], { input: 'In order to be measurable, we made a decision to count things.\n' });
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.ok(j.charsAfter < j.charsBefore);
  assert.equal(j.applied, 2);
});

test('a missing file is exit 2, not a stack trace', () => {
  const r = run(['/definitely/not/here.txt']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such file/);
});

test('an unknown option is exit 2', () => {
  const r = run(['--totally-not-a-flag']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option/);
});

test('trailing newline is not reported as a cut', () => {
  const f = path.join(os.tmpdir(), 'trimline-nl-' + process.pid + '.txt');
  fs.writeFileSync(f, 'The point is already lean.\n');
  const r = run([f]);
  fs.unlinkSync(f);
  assert.match(r.stdout, /chars 26 -> 26  \(-0\)/);
});

test('--rules swaps the phrase table', () => {
  const set = path.join(os.tmpdir(), 'set-' + process.pid + '.json');
  fs.writeFileSync(set, JSON.stringify({
    name: 'test-set',
    phrases: [{ from: 'at the end of the day', to: 'ultimately', safe: true }]
  }));
  const r = run(['-', '-b', 'x-post', '--rules', set, '--out', '-'],
    { input: 'At the end of the day, in order to ship.' });
  fs.unlinkSync(set);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /rule set: test-set \(1 rules, long-sentence limit 25\)/);
  assert.equal(r.stdout, 'Ultimately, in order to ship.\n',
    'custom set cuts its own rule and leaves the built-in one alone');
});

test('--dump-rules prints the active table', () => {
  const r = run(['--dump-rules']);
  assert.equal(r.status, 0);
  const d = JSON.parse(r.stdout);
  assert.equal(d.name, 'builtin');
  assert.equal(d.ruleCount, 48);
  assert.ok(Array.isArray(d.intensifiers) && d.intensifiers.length > 5);
});

test('a broken rule set fails loudly, not silently', () => {
  const set = path.join(os.tmpdir(), 'broken-' + process.pid + '.json');
  fs.writeFileSync(set, '{oops');
  const r = run(['-', '--rules', set], { input: 'anything' });
  fs.unlinkSync(set);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not valid JSON/);
});

test('several files produce a summary table and a CI exit code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-batch-'));
  const lean = path.join(dir, 'lean.txt');
  const fat = path.join(dir, 'fat.txt');
  fs.writeFileSync(lean, 'This one is already short.\n');
  fs.writeFileSync(fat, 'In order to be long, ' + Array(45).fill('padding').join(' ') + '.\n');
  const r = run([lean, fat, '-b', 'subject']);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 4, 'a file over budget must fail the run');
  assert.match(r.stdout, /file\s+chars\s+cut\s+findings\s+budget/);
  assert.match(r.stdout, /lean\.txt.*fits/s);
  assert.match(r.stdout, /fat\.txt.*OVER/s);
  assert.match(r.stdout, /2 files, 1 over the subject budget/);
});

test('a clean batch exits 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-ok-'));
  const a = path.join(dir, 'a.txt'), b = path.join(dir, 'b.txt');
  fs.writeFileSync(a, 'Short one.\n');
  fs.writeFileSync(b, 'Also short.\n');
  const r = run([a, b, '-b', 'x-post']);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /2 files, 0 over the x-post budget/);
});

test('--extend reports the merged rule count', () => {
  const set = path.join(os.tmpdir(), 'ext-' + process.pid + '.json');
  fs.writeFileSync(set, JSON.stringify({
    name: 'plus-one', phrases: [{ from: 'at the end of the day', to: 'ultimately', safe: true }]
  }));
  const r = run(['-', '--rules', set, '--extend'], { input: 'At the end of the day, in order to ship.' });
  fs.unlinkSync(set);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /rule set: plus-one \(49 rules, long-sentence limit 25\)/,
    '48 built-ins + 1 new, and the limit is stated too');
  assert.match(r.stdout, /in order to  \(safe\)/, 'built-in rules stay live');
});
