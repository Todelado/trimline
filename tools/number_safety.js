#!/usr/bin/env node
'use strict';
/*
 number_safety.js — prove the destructive path never touches a figure.

 The unit tests in test/rules.test.js check the rule *table*, which is where a digit could actually
 sneak in. This checks the property end-to-end over real prose: for every paragraph, a safe trim must
 preserve the multiset of numbers (digits and number words) and must never make the text longer.
 It is a check that can fail, and it has a corpus big enough to be worth running.

   node tools/number_safety.js [--dir ../../corpus] [--aggressive]
*/
const fs = require('fs');
const path = require('path');
const Trimline = require('../src/rules.js');

const ROOT = path.join(__dirname, '..');
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const DIR = path.isAbsolute(arg('dir', '') || '') ? arg('dir') : path.resolve(ROOT, arg('dir', 'corpus'));
if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error('No corpus at: ' + DIR);
  console.error('Point it at a folder of .txt files you have the rights to read:  node tools/number_safety.js --dir ./my-texts');
  process.exit(2);
}

const NUMS = /\d+(?:[.,]\d+)*|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion)\b/gi;
const numBag = (s) => (String(s).match(NUMS) || []).map((x) => x.toLowerCase().replace(/[.,]$/, ''));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const aggressive = process.argv.indexOf('--aggressive') > -1;
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();
let paras = 0, changed = 0, lengthened = 0, examples = [];

for (const f of files) {
  const parasIn = fs.readFileSync(path.join(DIR, f), 'utf8')
    .split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40 && !/^[_*=#\-\s]+$/.test(p));
  for (const p of parasIn) {
    paras++;
    const out = Trimline.trim(p, { aggressive: aggressive }).text;
    if (!same(numBag(p), numBag(out))) {
      changed++;
      if (examples.length < 5) examples.push({ f: f, before: numBag(p).slice(0, 6).join(','), after: numBag(out).slice(0, 6).join(','), text: p.slice(0, 90) });
    }
    if (out.length > p.length) lengthened++;
  }
}

console.log('Trimline v' + Trimline.version + ' — number safety · mode: ' + (aggressive ? 'aggressive' : 'safe cuts only'));
console.log('files: ' + files.join(', '));
console.log('paragraphs: ' + paras.toLocaleString('en-US'));
console.log('paragraphs whose numbers changed: ' + changed);
console.log('paragraphs that came out longer:  ' + lengthened);
examples.forEach((e) => console.log('  - ' + e.f + ' [' + e.before + ' -> ' + e.after + '] ' + e.text));
if (changed || lengthened) process.exit(1);
