'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/rules.js');

test('safe phrase cuts are applied', () => {
  const r = T.trim('In order to ship this, we need to do it due to the fact that the tests pass.');
  assert.match(r.text, /^To ship this/);
  assert.ok(!/in order to/i.test(r.text));
  assert.ok(!/due to the fact that/i.test(r.text));
  assert.ok(/because/.test(r.text));
});

test('unsafe phrases are flagged but not auto-applied', () => {
  const src = 'There are a lot of reasons, in most cases.';
  const out = T.trim(src);
  assert.match(out.text, /There are/i, 'existential opener must survive non-aggressive trim');
  const flagged = T.findFlags(src).filter(f => f.rule === 'there are');
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].safe, false);
});

test('aggressive mode applies unsafe phrases', () => {
  const out = T.trim('There are many edge cases.', { aggressive: true });
  assert.ok(!/^there are/i.test(out.text.trim()));
});

test('char savings are real and reported', () => {
  const src = 'We did this in order to reduce the number of on a daily basis failures.';
  const a = T.analyze(src);
  assert.ok(a.charsAfter < a.charsBefore);
  assert.ok(a.applied.length >= 1);
});

test('longest phrase wins over its own prefix', () => {
  const out = T.trim('in order to go home');
  assert.equal(out.text, 'To go home');
});

test('long sentences are flagged with a word count', () => {
  const src = 'The ' + Array(30).fill('thing').join(' ') + ' happened.';
  const f = T.findFlags(src).filter(x => x.rule === 'long-sentence');
  assert.equal(f.length, 1);
  assert.ok(f[0].words > 25);
});

test('passive heuristic catches was built', () => {
  const f = T.findFlags('The tool was built in a weekend.').filter(x => x.rule === 'passive');
  assert.equal(f.length, 1);
});

test('passive heuristic does not fire on plain past tense', () => {
  const f = T.findFlags('I built the tool.').filter(x => x.rule === 'passive');
  assert.equal(f.length, 0);
});

test('intensifiers are reported as word-level flags', () => {
  const f = T.findFlags('This is a very very small thing.');
  assert.equal(f.filter(x => x.rule === 'intensifier').length, 2);
});

test('budget status computes over-length', () => {
  const s = T.budgetStatus('x-post', 'x'.repeat(300));
  assert.equal(s.over, 20);
  assert.equal(s.fits, false);
  assert.equal(T.budgetStatus('x-post', 'short').fits, true);
});

test('budget list has unique ids and sane maxima', () => {
  const ids = T.BUDGETS.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
  T.BUDGETS.forEach(b => assert.ok(b.max >= 30 && b.max <= 3000, b.id));
});

test('readability returns plausible numbers for easy text', () => {
  const r = T.readability('The cat sat. The dog ran. We made it fast.');
  assert.ok(r.ease > 80, 'ease=' + r.ease);
  assert.ok(r.grade < 3, 'grade=' + r.grade);
});

test('empty input does not crash', () => {
  const a = T.analyze('');
  assert.equal(a.wordsAfter, 0);
  assert.equal(a.flags.length, 0);
});

test('trim leaves a grammatical sentence behind', () => {
  const src = 'It should be noted that the tests are green.';
  const out = T.trim(src).text.trim();
  assert.equal(out, 'The tests are green.');
});

test('capitalisation is restored after an opener is deleted', () => {
  const out = T.trim('in order to go, we ship. in order to ship, we test.').text;
  assert.ok(/^To go/.test(out), out);
  assert.match(out, /\. To ship/, out);
});

test('overlapping findings are not double counted', () => {
  const src = 'It should be noted that the tests are green.';
  const rules = T.findFlags(src).map(f => f.rule);
  assert.ok(rules.indexOf('it should be noted that') !== -1);
  assert.equal(rules.indexOf('passive'), -1,
    'passive inside a matched phrase must not be counted again');
});

test('passive outside a matched phrase is still reported', () => {
  const rules = T.findFlags('It should be noted that the report was written twice.').map(f => f.rule);
  assert.ok(rules.indexOf('passive') !== -1);
});

test('a colon does not force capitalisation', () => {
  const out = T.trim('In order to ship, note: keep the list lowercase.').text;
  assert.equal(out, 'To ship, note: keep the list lowercase.');
});

test('"each and every other" keeps its meaning', () => {
  const out = T.trim('Each and every other candidate was a gradient logo.').text;
  assert.equal(out, 'Every other candidate was a gradient logo.');
});

test('"each and every" without "other" still collapses', () => {
  const out = T.trim('each and every rule fires').text;
  assert.equal(out, 'Each rule fires');
});

test('overlapping phrase rules report once, longest wins', () => {
  const f = T.findFlags('each and every other rule');
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'each and every other');
});

// ---------------------------------------------------------------- custom rule sets (v0.2)
test('create() builds an isolated engine from data', () => {
  const e = T.create({ name: 'tiny', phrases: [{ from: 'in order to', to: 'to', safe: true }] });
  assert.equal(e.name, 'tiny');
  assert.equal(e.ruleCount, 1);
  assert.equal(e.trim('in order to go').text, 'To go');
  // the built-in engine is untouched by what the custom one contains
  assert.match(T.trim('each and every one').text, /each one/i,
    'the built-in engine keeps its own table');
});

test('a rule set without a rule keeps its distance from the built-ins', () => {
  const e = T.create({ phrases: [{ from: 'made a decision', to: 'decided', safe: true }] });
  // no cut, no change at all — including capitalisation
  assert.match(e.trim('each and every one').text, /^each and every one$/,
    'custom sets must not inherit built-in cuts');
});

test('rules are unsafe unless declared safe', () => {
  const e = T.create({ phrases: [{ from: 'in order to', to: 'to' }] });
  // no cut, no change: trim no longer re-capitalises text it never touched
  // (the old blanket pass would have "fixed" this and quietly rewritten other people's prose)
  assert.equal(e.trim('in order to go').text, 'in order to go');
  const f = e.findFlags('in order to go');
  assert.equal(f[0].safe, false);
});

test('invalid rule sets are rejected with readable errors', () => {
  assert.throws(() => T.create({ phrases: [{ to: 'x' }] }), /must be a non-empty string/);
  assert.throws(() => T.create({ phrases: [{ from: 'a', to: 3 }] }), /"to" must be a string/);
  assert.throws(() => T.create({ phrases: [{ from: 'dup', to: '', safe: true }, { from: 'dup', to: 'x' }] }),
    /duplicate rule/);
  assert.throws(() => T.create({ phrases: 'not an array' }), /must be an array/);
});

test('custom intensifiers replace the default list', () => {
  const e = T.create({ phrases: [], intensifiers: ['rather'] });
  assert.equal(e.findFlags('a very rather thing').filter(f => f.rule === 'intensifier').length, 1);
});

test('--extend style rule sets add to the built-ins', () => {
  const e = T.create({
    extend: true,
    phrases: [{ from: 'at the end of the day', to: 'ultimately', safe: true }]
  });
  assert.equal(e.ruleCount, T.PHRASES.length + 1);
  assert.equal(e.extended, true);
  assert.match(e.trim('each and every one').text, /each one/i, 'built-ins still active');
  assert.match(e.trim('at the end of the day, ship').text, /^Ultimately, ship/);
});

test('an extending set overrides a built-in rule instead of colliding with it', () => {
  const e = T.create({
    extend: true,
    phrases: [{ from: 'in order to', to: 'so as to', safe: true }]
  });
  assert.equal(e.ruleCount, T.PHRASES.length, 'redefining must not duplicate the rule');
  assert.match(e.trim('in order to go').text, /^So as to go/, 'the custom version wins');
});

test('a non-extending set still refuses duplicates', () => {
  assert.throws(() => T.create({
    phrases: [{ from: 'dup', to: '', safe: true }, { from: 'dup', to: 'x' }]
  }), /duplicate rule/);
});

// ------------------------------------------------------ sentence boundaries (v0.2.2)
test('abbreviations, decimals and initials do not end a sentence', () => {
  const cases = [
    ['Dr. Smith arrived at 3.5pm. The tests were green.', 2],
    ['We shipped e.g. the CLI. It works.', 2],
    ['J. K. Rowling wrote it. It sold.', 2],
    ['We use HTTP. It is fine.', 2],
    ['Ship it (v2). Then sleep.', 2],
    ['Did it ship? Yes. It fit!', 3],
    ['He said stop. Then he left.', 2]
  ];
  cases.forEach(function (c) {
    assert.equal(T.sentences(c[0]).length, c[1], 'split count for: ' + c[0]);
  });
});

test('a sentence ending in a capital letter still ends the sentence', () => {
  // regression: a ^-anchored test on a short slice made every "…I." look like an initial
  const s = T.sentences('We use the CLI. It works.');
  assert.equal(s.length, 2);
  assert.equal(s[0], 'We use the CLI.');
});

test('line breaks are sentence boundaries', () => {
  assert.equal(T.sentences('Line one\nLine two\nLine three').length, 3);
});

test('readability counts sentences the same way', () => {
  const r = T.readability('Dr. Smith arrived at 3.5pm. The tests were green.');
  assert.equal(r.sentences, 2);
});

test('long-sentence detection survives abbreviations', () => {
  const src = 'Dr. Smith, e.g. in the CLI, ' + Array(28).fill('thing').join(' ') + '. It shipped.';
  const long = T.findFlags(src).filter(f => f.rule === 'long-sentence');
  assert.equal(long.length, 1);
  assert.ok(long[0].words > 25);
});

test('adjectival participles are not reported as passive voice', () => {
  assert.equal(T.findFlags('I was tired after the build.').filter(f => f.rule === 'passive').length, 0);
  assert.equal(T.findFlags('We were surprised by the result.').filter(f => f.rule === 'passive').length, 0);
  assert.equal(T.findFlags('The tool was built in a weekend.').filter(f => f.rule === 'passive').length, 1);
});

// ---------------------------------------------- real prose: markdown emphasis + thresholds (v0.3)
test('phrases inside markdown emphasis are still found and cut', () => {
  // \b treats "_" as a word character, so this used to be invisible to the matcher
  assert.equal(T.findFlags('_very_ important').filter(f => f.rule === 'intensifier').length, 1);
  assert.equal(T.findFlags('*really* good').filter(f => f.rule === 'intensifier').length, 1);
  const out = T.trim('_in order to_ ship it').text;
  // markers are the writer's formatting: kept, not silently deleted.
  // The cut is lowercase because the phrase was not at the start of the sentence.
  assert.equal(out, '_to_ ship it');
});

test('emphasis markers do not create phantom matches inside words', () => {
  assert.equal(T.findFlags('veryx inverb').filter(f => f.rule === 'intensifier').length, 0);
});

test('the long-sentence limit is data, not a constant', () => {
  const src = 'The ' + Array(30).fill('word').join(' ') + ' happened.';
  assert.equal(T.findFlags(src).filter(f => f.rule === 'long-sentence').length, 1, 'default 25');
  const e = T.create({
    phrases: [], thresholds: { longSentenceWords: 40 }
  });
  assert.equal(e.findFlags(src).filter(f => f.rule === 'long-sentence').length, 0, 'limit 40');
  const tight = T.create({ phrases: [], thresholds: { longSentenceWords: 12 } });
  assert.equal(tight.findFlags(src).filter(f => f.rule === 'long-sentence').length, 1);
});

test('the bullet-wall threshold is data too', () => {
  const src = ['- one', '- two', '- three'].join('\n');
  assert.equal(T.findFlags(src).filter(f => f.rule === 'bullet-wall').length, 0, '3 < default 4');
  const e = T.create({ phrases: [], thresholds: { bulletWall: 3 } });
  assert.equal(e.findFlags(src).filter(f => f.rule === 'bullet-wall').length, 1);
});

test('bad thresholds are rejected by name', () => {
  assert.throws(() => T.create({ phrases: [], thresholds: { longSentenceWords: 'lots' } }),
    /positive integer/);
  assert.throws(() => T.create({ phrases: [], thresholds: { sentenceWords: 20 } }), /unknown threshold/);
  assert.throws(() => T.create({ phrases: [], thresholds: 5 }), /thresholds must be an object/);
});

test('a rule set that omits thresholds keeps the defaults', () => {
  const e = T.create({ phrases: [{ from: 'in order to', to: 'to', safe: true }] });
  assert.equal(e.thresholds.longSentenceWords, T.DEFAULT_THRESHOLDS.longSentenceWords);
});

// ------------------------------------------ a cutter must not rewrite what it did not cut (v0.3)
test('trim leaves untouched sentences exactly as written', () => {
  // real lines from the corpus that the old blanket capitalisation pass used to "fix"
  ['Oh! don\u2019t say such horrid things.',
   'Good! this is quite touching.',
   'Do you know him, Mme. de Saint-Sauveur?',
   '\u2018you villain! you thief! How dare you touch that coronet?\u2019'
  ].forEach(function (line) {
    assert.equal(T.trim(line).text, line, 'unchanged: ' + line);
  });
});

test('a cut in the second sentence capitalises the second sentence only', () => {
  assert.equal(
    T.trim('well! it is fine, and in order to prove it we test.').text,
    'well! it is fine, and to prove it we test.');
  assert.equal(
    T.trim('In order to go, we ship. in order to ship, we test.').text,
    'To go, we ship. To ship, we test.');
});

test('analyze reports sentence counts for before and after separately', () => {
  const a = T.analyze('Dr. Smith arrived at 3.5pm. In order to be early, he left. The tests were green.');
  assert.equal(a.sentencesBefore, 3, 'the writing itself has three sentences');
  assert.equal(a.sentencesAfter, 3, 'a mid-sentence cut does not merge sentences');
  assert.ok(a.wordsAfter < a.wordsBefore);
});

test('a denominator does not move when trim behaviour moves', () => {
  const src = 'We shipped it, in order to be early. Then we slept.';
  const a = T.analyze(src, {});
  const b = T.analyze(src, { aggressive: true });
  assert.equal(a.sentencesBefore, b.sentencesBefore, 'before-count is trim-independent');
  assert.equal(a.sentencesBefore, 2);
});

// --------------------------------- closing marks and dashes in sentence boundaries (v0.3.3)
test('a dash after the period still ends the sentence', () => {
  // found in Darwin: a chapter summary glued 200+ words together
  const s = T.sentences('_Summary of the Chapters_.—I have attempted to show it. The record is imperfect.');
  assert.equal(s.length, 3);
  // the dash belongs to the heading line, not to the next sentence
  assert.equal(s[0], '_Summary of the Chapters_.—');
});

test('a dash before an opening quote does not swallow the quote', () => {
  assert.deepEqual(T.sentences('He said—“Do not go.” Then he left.'),
    ['He said—“Do not go.”', 'Then he left.']);
});

test('abbreviations survive the dash rule', () => {
  assert.equal(T.sentences('We use e.g. this method. It works.').length, 2);
  assert.equal(T.sentences('See Plate 3.—It shows the difference.').length, 2);
});

// ---------------------------------------------------------------------- idempotence (v0.3.4)
test('trim is a fixed point: applying it twice changes nothing', () => {
  [
    '.. outside the bowl 2 fingers lower than the level of the oil.',
    '  . It should be noted that the tests are green.',
    '!! in order to ship it, we made a decision to test.',
    '  ..  each and every rule fires, in order to help.',
    'already clean.'
  ].forEach(function (src) {
    const once = T.trim(src, {}).text;
    const twice = T.trim(once, {}).text;
    assert.equal(twice, once, 'second pass changed the text for: ' + JSON.stringify(src));
  });
});

// ------------------------------------------------- repeated rules report the worst case (v0.3.5)
test('a repeated rule reports its worst finding, not its first', () => {
  // capitalised starts, because a lowercase word after a period is not a new sentence
  const src = 'One. ' + 'Word '.repeat(27).trim() + '. ' + 'Long '.repeat(65).trim() + '.';
  const a = T.analyze(src, {});
  const ls = a.issues.filter(i => i.rule === 'long-sentence');
  assert.equal(ls.length, 1, 'long-sentence should be grouped into one issue');
  assert.equal(ls[0].count, 2);
  assert.ok(/65 words/.test(ls[0].note), 'note should quote the 65-word sentence, got: ' + ls[0].note);
});
