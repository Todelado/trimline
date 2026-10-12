#!/usr/bin/env node
'use strict';
/* Trimline CLI — same rules engine as the web page, for editors and CI.
   Usage: node src/cli.js [file] [-b x-post] [-a] [--json] [--out FILE] [--diff] */
const fs = require('fs');
const T = require('./rules.js');

// `trimline draft.txt | head` must not end in a stack trace: a closed downstream pipe
// is normal usage, not an error.
process.stdout.on('error', function (e) {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

function parseArgs(argv) {
  const o = { file: null, budget: null, aggressive: false, json: false, out: null, diff: false,
    rules: null, extend: false, dumpRules: false, help: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-a' || a === '--aggressive') o.aggressive = true;
    else if (a === '--json') o.json = true;
    else if (a === '--diff') o.diff = true;
    else if (a === '-b' || a === '--budget') o.budget = argv[++i];
    else if (a === '--out') { o.out = argv[++i]; }
    else if (a === '--rules') o.rules = argv[++i];
    else if (a === '--extend') o.extend = true;
    else if (a === '--dump-rules') o.dumpRules = true;
    else if (a === '-') o.file = '-';
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else { o.file = a; o.files.push(a); }
  }
  return o;
}

function readInput(file) {
  if (file && file !== '-') {
    if (!fs.existsSync(file)) { console.error('trimline: no such file: ' + file); process.exit(2); }
    return fs.readFileSync(file, 'utf8');
  }
  // Never block waiting for a terminal: stdin only makes sense when piped.
  if (process.stdin.isTTY) {
    console.error('trimline: no input. Pass a file, or pipe text: echo "..." | trimline -');
    process.exit(2);
  }
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function lineDiff(before, after) {
  const b = before.split('\n'), a = after.split('\n');
  const set = new Set(a);
  const rows = [];
  b.forEach((l) => { if (!set.has(l) && l.trim()) rows.push('- ' + l); });
  const setB = new Set(b);
  a.forEach((l) => { if (!setB.has(l) && l.trim()) rows.push('+ ' + l); });
  return rows.join('\n');
}

function loadRuleSet(file) {
  if (!fs.existsSync(file)) { console.error('trimline: no such rule set: ' + file); process.exit(2); }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('trimline: rule set is not valid JSON: ' + e.message); process.exit(2);
  }
  return Array.isArray(parsed) ? { phrases: parsed } : parsed;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  let engine = T;
  if (o.rules) {
    const spec = loadRuleSet(o.rules);
    if (o.extend) spec.extend = true;
    engine = T.create(spec);
  }
  const piping = o.out === '-';
  const say = piping ? (m) => process.stderr.write(m + '\n') : (m) => process.stdout.write(m + '\n');
  if (o.help) {
    console.log('Trimline ' + T.version + ' — cut the flab, keep the meaning');
    console.log('usage: trimline [FILE|-] [MORE FILES...] [-b ' + T.BUDGETS.map(b => b.id).join('|') +
      '] [-a] [--json] [--diff] [--out FILE] [--rules SET.json] [--extend] [--dump-rules]');
    console.log('several files print a summary table; exit 4 if any of them is over budget');
    return 0;
  }
  // dumping the active table beats trusting it: this is what a rule set actually contains
  if (o.dumpRules) {
    console.log(JSON.stringify({
      name: engine.name || 'builtin',
      version: engine.version,
      ruleCount: engine.PHRASES.length,
      rules: engine.PHRASES,
      intensifiers: engine.INTENSIFIERS
    }, null, 2));
    return 0;
  }
  // More than one file: a summary table. This is the loop I kept writing in bash.
  if (o.files.length > 1) {
    const rows = o.files.map(function (f) {
      let txt = fs.readFileSync(f, 'utf8').replace(/\n$/, '');
      const a = engine.analyze(txt, { aggressive: o.aggressive });
      const b = o.budget ? engine.budgetStatus(o.budget, a.trimmed) : null;
      return { file: f, before: a.charsBefore, after: a.charsAfter, cut: a.charsBefore - a.charsAfter,
               flags: a.flags.length, budget: b };
    });
    const nameW = rows.reduce(function (m, r) { return Math.max(m, r.file.length); }, 4);
    const pad = function (v, w) { return String(v) + ' '.repeat(Math.max(0, w - String(v).length)); };
    console.log(pad('file', nameW) + '  chars        cut  findings' + (o.budget ? '  budget' : ''));
    rows.forEach(function (r) {
      console.log(pad(r.file, nameW) + '  ' + pad(r.before + '→' + r.after, 11) + '  ' +
        pad('−' + r.cut, 4) + '  ' + pad(r.flags, 9) +
        (r.budget ? '  ' + (r.budget.fits ? 'fits ' + r.budget.length + '/' + r.budget.max
          : 'OVER by ' + r.budget.over) : ''));
    });
    const over = rows.filter(function (r) { return r.budget && !r.budget.fits; }).length;
    console.log('\n' + rows.length + ' files' +
      (o.budget ? ', ' + over + ' over the ' + o.budget + ' budget' : '') +
      (o.rules ? ' · rule set: ' + (engine.name || 'custom') + ' (' + engine.PHRASES.length + ' rules)' : ''));
    return over > 0 ? 4 : 0;
  }
  let src = readInput(o.file);
  // a file's trailing newline is not part of the text; don't report it as a cut
  if (src.endsWith('\n') && !src.endsWith('\n\n')) src = src.slice(0, -1);
  if (!src.trim()) { console.error('trimline: no input'); return 1; }

  const a = engine.analyze(src, { aggressive: o.aggressive });
  if (o.out) {
    const body = a.trimmed.endsWith('\n') ? a.trimmed : a.trimmed + '\n';
    if (o.out === '-') process.stdout.write(body); else fs.writeFileSync(o.out, body);
  }
  if (o.json) {
    // consumers (card renderer, CI, editors) need the version alongside the numbers,
    // or a measurement cannot be attributed to a build.
    console.log(JSON.stringify({
      version: engine.version, ruleCount: engine.PHRASES.length,
      ruleSet: engine.name || 'builtin',
      sentencesBefore: a.sentencesBefore, sentencesAfter: a.sentencesAfter,
      wordsBefore: a.wordsBefore, wordsAfter: a.wordsAfter,
      charsBefore: a.charsBefore, charsAfter: a.charsAfter,
      readability: a.readability, issues: a.issues, applied: a.applied.length,
      longestSentence: { words: a.longestSentence.words,
                         text: a.longestSentence.text.slice(0, 120) },
      budget: o.budget ? engine.budgetStatus(o.budget, a.trimmed) : null,
    ruleSet: engine.name || 'builtin', ruleCount: engine.PHRASES.length
    }, null, 2)); return 0;
  }

  const saved = a.charsBefore - a.charsAfter;
  say('words ' + a.wordsBefore + ' -> ' + a.wordsAfter +
    '   chars ' + a.charsBefore + ' -> ' + a.charsAfter + '  (-' + saved + ')');
  if (o.rules) {
    var lim = engine.thresholds ? engine.thresholds.longSentenceWords : T.DEFAULT_THRESHOLDS.longSentenceWords;
    say('rule set: ' + (engine.name || 'custom') + ' (' + engine.PHRASES.length + ' rules, long-sentence limit ' + lim + ')');
  }
  say('sentences ' + a.sentencesBefore + (a.sentencesAfter !== a.sentencesBefore ? ' (after: ' + a.sentencesAfter + ')' : ''));
  say('reading ease ' + a.readability.ease + '   grade ' + a.readability.grade +
    '   longest sentence ' + a.longestSentence.words + ' words');
  if (o.budget) {
    const b = engine.budgetStatus(o.budget, a.trimmed);
    if (!b) { console.error('unknown budget: ' + o.budget); return 2; }
    say('budget ' + b.label + ': ' + b.length + '/' + b.max + (b.fits ? '  fits' : '  OVER by ' + b.over));
  }
  if (a.issues.length) {
    say('\nfindings');
    a.issues.forEach(i => say('  ' + String(i.count).padStart(3) + '  ' + i.rule +
      (i.safe === false ? '  (risky)' : i.kind === 'phrase' ? '  (safe)' : '') + '  — ' + i.note));
  } else {
    say('\nno findings — already lean.');
  }
  if (o.diff) { say('\ndiff\n' + lineDiff(src, a.trimmed)); }
  return 0;
}

process.exitCode = main();
