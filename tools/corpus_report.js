#!/usr/bin/env node
'use strict';
/*
 corpus_report.js — run the rules engine over prose I did not write.

 The point is not the totals. It is the samples: a rule that fires 4,000 times in a 19th-century
 novel is probably not a rule for that surface, and a rule that fires on a sentence that is
 already fine is a false positive with my name on it.

   node tools/corpus_report.js [--dir ../../corpus] [--samples 3] [--limit N]
*/
const fs = require('fs');
const path = require('path');
const T = require('../src/rules.js');

// A rule set can be supplied so the same corpus can be measured under two calibrations.
function loadSet(file) {
  if (!file) return T;
  const parsed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'));
  return T.create(Array.isArray(parsed) ? { phrases: parsed } : parsed);
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}
const ROOT = path.resolve(__dirname, '..', '..', '..');   // .../workspace
const DIR = path.isAbsolute(arg('dir', '') || '') ? arg('dir') : path.resolve(ROOT, arg('dir', 'corpus'));

// The default points at a folder that lives outside this repo, so say so instead of throwing ENOENT
// at someone who has never seen it.
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error('No corpus at: ' + DIR);
  console.error('Pass a folder of .txt files you have the rights to read:  node tools/corpus_report.js --dir ./my-texts');
  console.error('The texts this was calibrated on are Project Gutenberg editions; see README.md.');
  process.exit(2);
}
const SAMPLES = parseInt(arg('samples', '3'), 10);
const LIMIT = parseInt(arg('limit', '0'), 10);   // paragraphs per file, 0 = all
const ENGINE = loadSet(arg('rules', ''));

function paragraphs(text) {
  return text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 40);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function report(file) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  let paras = paragraphs(text);
  if (LIMIT) paras = paras.slice(0, LIMIT);

  const agg = {
    file: path.basename(file), paragraphs: paras.length, sentences: 0, words: 0, chars: 0,
    sentLens: [], findings: {}, samples: [], maxSentence: { words: 0, text: '' }
  };

  paras.forEach(function (p) {
    const a = ENGINE.analyze(p, {});
    agg.sentences += a.sentencesBefore;   // denominator = the writing, not the tool's output
    agg.words += a.wordsBefore;
    agg.chars += a.charsBefore;
    T.sentences(p).forEach(function (s) {
      const n = T.countWords(s);
      agg.sentLens.push(n);
      if (n > agg.maxSentence.words) agg.maxSentence = { words: n, text: s };
    });
    a.flags.forEach(function (f) {
      const key = f.rule + ' [' + (f.kind === 'phrase' ? (f.safe ? 'auto-cut' : 'flag-only') : f.kind) + ']';
      agg.findings[key] = (agg.findings[key] || 0) + 1;
      if (agg.samples.length < 400) agg.samples.push({ rule: f.rule, kind: f.kind, text: p.slice(0, 130) });
    });
  });

  agg.sentLens.sort((x, y) => x - y);
  return agg;
}

// The destructive path deserves the same look: what does "Apply safe cuts" do to prose that
// somebody else published? Deterministic even-stride sample of the paragraphs that changed.
function diffs(files, n) {
  const changed = [];
  let considered = 0;
  files.forEach(function (file) {
    paragraphs(fs.readFileSync(path.join(DIR, file), 'utf8')).forEach(function (p, i) {
      considered++;
      const out = ENGINE.trim(p, {}).text;
      if (out !== p) changed.push({ where: file + ' \u00b6' + i, before: p, after: out });
    });
  });
  const stride = Math.max(1, Math.floor(changed.length / Math.max(1, n)));
  for (let i = 0; i < changed.length && i / stride < n; i += stride) {
    const d = changed[i];
    console.log('\n--- ' + d.where);
    console.log('BEFORE: ' + d.before);
    console.log('AFTER : ' + d.after);
  }
  console.log('\n' + changed.length + ' of ' + considered + ' paragraphs changed by the safe cuts (' +
    (100 * changed.length / Math.max(1, considered)).toFixed(1) + '%); showing every ' +
    stride + 'th (deterministic)');
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).sort();
  const lim = ENGINE.thresholds ? ENGINE.thresholds.longSentenceWords : 25;
  console.log('Trimline v' + ENGINE.version + ' — corpus check · rule set: ' +
    (ENGINE.name || 'builtin') + ' (' + ENGINE.PHRASES.length + ' rules, long-sentence limit ' + lim + ')');
  console.log('files: ' + files.join(', ') + '\n');

  const all = files.map(report);
  const grand = { sent: 0, words: 0, longOver: 0 };

  all.forEach(function (a) {
    const avg = a.sentences ? (a.words / a.sentences) : 0;
    const longOver = a.sentLens.filter(n => n > lim).length;
    grand.sent += a.sentences; grand.words += a.words; grand.longOver += longOver;
    console.log('== ' + a.file);
    console.log('   paragraphs ' + a.paragraphs + ' · sentences ' + a.sentences + ' · words ' + a.words +
      ' · avg ' + avg.toFixed(1) + ' words/sentence · p50 ' + quantile(a.sentLens, 0.5) +
      ' · p90 ' + quantile(a.sentLens, 0.9) + ' · max ' + (a.sentLens[a.sentLens.length - 1] || 0));
    console.log('   sentences over the ' + lim + '-word limit: ' + longOver +
      ' (' + (100 * longOver / Math.max(1, a.sentences)).toFixed(1) + '%)  <- noise on this surface');
    const top = Object.entries(a.findings).sort((x, y) => y[1] - x[1]).slice(0, 8);
    top.forEach(function (e) {
      const per1k = (1000 * e[1] / Math.max(1, a.words)).toFixed(2);
      console.log('     ' + e[0].padEnd(42) + String(e[1]).padStart(5) + '   ' + per1k + ' / 1k words');
    });
    console.log('   longest sentence in file: ' + a.maxSentence.words + ' words — "' +
      a.maxSentence.text.slice(0, 110) + '…"');
    console.log('');
  });

  console.log('== across the corpus: ' + grand.sent + ' sentences, ' + grand.words +
    ' words, ' + (100 * grand.longOver / Math.max(1, grand.sent)).toFixed(1) + '% over the ' + lim +
    '-word limit\n');

  // samples are where false positives show up
  ['long-sentence', 'passive', 'intensifier', 'there is', 'in order to'].forEach(function (rule) {
    const hits = [];
    all.forEach(function (a) {
      a.samples.forEach(function (s) { if (s.rule === rule && hits.length < SAMPLES) hits.push(s); });
    });
    if (!hits.length) return;
    console.log('-- samples for "' + rule + '"');
    hits.forEach(function (h) { console.log('   · ' + h.text); });
    console.log('');
  });
}

if (process.argv.indexOf('--diffs') !== -1) {
  const n = parseInt(process.argv[process.argv.indexOf('--diffs') + 1] || '12', 10);
  diffs(fs.readdirSync(DIR).filter(f => f.endsWith('.txt')).sort(), n);
} else {
  main();
}
