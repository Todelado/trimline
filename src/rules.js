/*
 * Trimline rules engine (v0.1)
 * Pure, deterministic, zero-dependency. Runs in the browser and in Node.
 * Design rule: a suggestion is only "safe" if replacing it cannot change meaning
 * or break grammar. Anything subjective is reported as a flag, never auto-applied.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- phrase rules
  // Word boundaries, without \b: \b counts "_" as a word character, so markdown emphasis
  // ("_in order to_ ship") used to hide the phrase from the matcher entirely.
  // No lookbehind either — older Safari must still be able to run the page build.
  // The boundary is any character that is not a letter or digit — including "_", which is exactly
  // what \b wrongly treats as a word character.
  var SENTINEL = '\u0001';   // marks a deletion site for this run only; never survives trim
  var LBOUND = '(^|[^A-Za-z0-9])';
  var RBOUND = '(?![A-Za-z0-9])';
  function wordRe(body, flags) {
    return new RegExp(LBOUND + body + RBOUND, flags || 'gi');
  }


  // safe:true  -> auto-applied by trim()
  // safe:false -> reported as a suggestion only
  var PHRASES = [
    { from: 'in order to', to: 'to', safe: true, note: 'padded infinitive' },
    { from: 'due to the fact that', to: 'because', safe: true, note: 'padded causal' },
    { from: 'owing to the fact that', to: 'because', safe: true, note: 'padded causal' },
    { from: 'at this point in time', to: 'now', safe: true, note: 'padded time' },
    { from: 'in the event that', to: 'if', safe: true, note: 'padded conditional' },
    { from: 'in spite of the fact that', to: 'although', safe: true, note: 'padded concessive' },
    { from: 'a large number of', to: 'many', safe: true, note: 'padded quantifier' },
    { from: 'a majority of', to: 'most', safe: true, note: 'padded quantifier' },
    { from: 'each and every other', to: 'every other', safe: true, note: 'doublet + ordinal' },
    { from: 'each and every', to: 'each', safe: true, note: 'doublet' },
    { from: 'various different', to: 'various', safe: true, note: 'doublet' },
    { from: 'absolutely essential', to: 'essential', safe: true, note: 'doublet' },
    { from: 'completely eliminate', to: 'eliminate', safe: true, note: 'doublet' },
    { from: 'final outcome', to: 'outcome', safe: true, note: 'doublet' },
    { from: 'past history', to: 'history', safe: true, note: 'doublet' },
    { from: 'new innovation', to: 'innovation', safe: true, note: 'doublet' },
    { from: 'on a daily basis', to: 'daily', safe: true, note: 'padded adverbial' },
    { from: 'on a regular basis', to: 'regularly', safe: true, note: 'padded adverbial' },
    { from: 'in a timely manner', to: 'promptly', safe: true, note: 'padded adverbial' },
    { from: 'in most cases', to: 'usually', safe: false, note: 'hedging, may carry meaning' },
    { from: 'with regard to', to: 'about', safe: true, note: 'padded reference' },
    { from: 'with respect to', to: 'about', safe: true, note: 'padded reference' },
    { from: 'in terms of', to: 'for', safe: false, note: 'vague frame; check meaning' },
    { from: 'take into account', to: 'consider', safe: true, note: 'nominalisation' },
    { from: 'make a decision', to: 'decide', safe: true, note: 'nominalisation' },
    { from: 'makes a decision', to: 'decides', safe: true, note: 'nominalisation' },
    { from: 'made a decision', to: 'decided', safe: true, note: 'nominalisation' },
    { from: 'took into account', to: 'considered', safe: true, note: 'nominalisation' },
    { from: 'came to a conclusion', to: 'concluded', safe: true, note: 'nominalisation' },
    { from: 'had the ability to', to: 'could', safe: true, note: 'nominalisation' },
    { from: 'come to a conclusion', to: 'conclude', safe: true, note: 'nominalisation' },
    { from: 'reach an agreement', to: 'agree', safe: true, note: 'nominalisation' },
    { from: 'give consideration to', to: 'consider', safe: true, note: 'nominalisation' },
    { from: 'have the ability to', to: 'can', safe: true, note: 'nominalisation' },
    { from: 'is able to', to: 'can', safe: true, note: 'nominalisation' },
    { from: 'was able to', to: 'could', safe: true, note: 'nominalisation' },
    { from: 'has the capacity to', to: 'can', safe: true, note: 'nominalisation' },
    { from: 'for the purpose of', to: 'to', safe: false, note: 'needs gerund rewrite' },
    { from: 'as a means of', to: 'to', safe: false, note: 'needs gerund rewrite' },
    { from: 'it should be noted that', to: '', safe: true, note: 'throat-clearing' },
    { from: 'it is worth noting that', to: '', safe: true, note: 'throat-clearing' },
    { from: 'needless to say', to: '', safe: false, note: 'throat-clearing, but tone-setting' },
    { from: 'I think that', to: '', safe: false, note: 'hedging; keep if you mean "I believe"' },
    { from: 'I believe that', to: '', safe: false, note: 'hedging' },
    { from: 'there are', to: '', safe: false, note: 'existential opener; usually cuttable' },
    { from: 'there is', to: '', safe: false, note: 'existential opener; usually cuttable' },
    { from: 'there was', to: '', safe: false, note: 'existential opener; usually cuttable' },
    { from: 'used to be able to', to: 'could', safe: true, note: 'padded modal' }
  ];

  // Intensity words: never auto-removed (they can carry emphasis the writer wants).
  var INTENSIFIERS = ['very', 'really', 'quite', 'actually', 'basically', 'simply',
    'literally', 'just', 'totally', 'absolutely', 'extremely', 'somewhat', 'rather'];

  var PARTICIPLES = '\\w+ed|made|seen|known|given|taken|written|shown|held|built|sent|' +
    'kept|found|left|brought|thought|told|asked|allowed|called|paid|read|built|put|set|cut|drawn|grown|thrown|flown';

  var BUDGETS = [
    { id: 'x-post', label: 'X post', max: 280, hint: 'links cost 23 characters' },
    { id: 'x-thread-step', label: 'X thread step', max: 250, hint: 'leave room for the step number' },
    { id: 'subject', label: 'Email subject', max: 60, hint: 'desktop inbox truncates around 60' },
    { id: 'push', label: 'Push / notification', max: 120, hint: 'two lines on most phones' },
    { id: 'readme-line', label: 'README tagline', max: 140, hint: 'shows next to the repo name' },
    { id: 'linkedin', label: 'LinkedIn post', max: 3000, hint: 'hard cut at 3000' },
    { id: 'prs-body', label: 'PR description', max: 1000, hint: 'reviewers skim' }
  ];

  // ---------------------------------------------------------------- helpers
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function preserveCase(sample, replacement) {
    if (!replacement) return '';
    var m = sample.match(/^[A-Z][a-z]+/);
    if (m && sample[0] === m[0][0]) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    if (/^[A-Z]+$/.test(sample)) return replacement.toUpperCase();
    return replacement;
  }

  // Longest-first so "in order to" wins over "in order".
  var PHRASES_SORTED = PHRASES.slice().sort(function (a, b) {
    return b.from.length - a.from.length;
  });

  function countWords(text) {
    var t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  // Sentence boundaries are where the naive version of this tool used to break:
  // "Dr. Smith arrived at 3.5pm." is one sentence, not two.
  var ABBREVIATIONS = ['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'sr', 'jr', 'vs', 'etc',
    'ie', 'i.e', 'eg', 'e.g', 'inc', 'ltd', 'co', 'approx', 'fig', 'al', 'dept', 'jan',
    'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  var ADJECTIVAL_PARTICIPLES = ['tired', 'bored', 'excited', 'surprised', 'married', 'afraid',
    'confused', 'frightened', 'pleased', 'disappointed', 'interested', 'annoyed', 'embarrassed',
    'worried', 'gone', 'done', 'ready'];

  // What may sit between a sentence-ending mark and the space that follows it: closing quotes,
  // brackets, markdown emphasis, and — in older and translated texts — a dash:
  // "Chapters_.—I have attempted…" was one 214-word "sentence" until this existed.
  var CLOSERS = '\"\'”’)]_*';
  function skipTail(src, i) {
    // punctuation, then any closing marks, then at most one dash: "Chapters_.—I have…" and
    // "said—“Do not go.”" both have to be readable as a boundary
    var j = i + 1;
    while (j < src.length && CLOSERS.indexOf(src[j]) !== -1) j++;
    if (j < src.length && (src[j] === '-' || src[j] === '\u2014' || src[j] === '\u2013')) {
      j++;
      while (j < src.length && CLOSERS.indexOf(src[j]) !== -1) j++;
    }
    return j;
  }

  function isSentenceEnd(src, i) {
    var ch = src[i];
    if ('.!?'.indexOf(ch) === -1) return false;
    var j = skipTail(src, i);
    var next = src[j];
    // after the punctuation (and any closers/dash) there must be a space, an end, or the visible
    // start of a new sentence — a capital, a digit, or an opening quote. "e.g. this" fails the
    // abbreviation check below; "smth.x" fails here.
    var looksLikeNewSentence = next !== undefined && /^[A-Z0-9\"'“‘(\[]/.test(next);
    if (next !== undefined && !/\s/.test(next) && !looksLikeNewSentence) return false;

    if (ch === '.') {
      var prev = src[i - 1];
      if (prev === undefined) return false;
      // decimal: 3.5
      if (/[0-9]/.test(prev) && /[0-9]/.test(next || '')) return false;
      if (looksLikeNewSentence && /[0-9]/.test(prev) ) { /* digits before a capital: still a break */ }
      // abbreviation: Dr. / e.g. / etc., and single-letter initials: J. K.
      // (match the word before the period; never test a slice against a ^-anchored pattern,
      //  because ^ matches the start of any slice and silently swallows real sentence ends)
      var m = src.slice(0, i + 1).match(/([A-Za-z](?:[A-Za-z.]*[A-Za-z])?)\.?$/);
      if (m) {
        var token = m[1];
        if (token.length === 1 && /[A-Z]/.test(token)) return false;
        var low = token.toLowerCase();
        if (ABBREVIATIONS.indexOf(low) !== -1 || ABBREVIATIONS.indexOf(low.replace(/\./g, '')) !== -1) return false;
      }
    }
    // a sentence ends if what follows looks like a new one, or the line ends here
    var rest = src.slice(j);
    if (/^\s*([\"'“‘(\[]?[A-Z0-9])/.test(rest)) return true;
    return /^\s*$/.test(rest);
  }

  function sentences(text) {
    var src = String(text || '');
    var out = [];
    var start = 0;
    for (var i = 0; i < src.length; i++) {
      if (src[i] === '\n') {
        var chunk = src.slice(start, i).trim();
        if (chunk) out.push(chunk);
        start = i + 1;
        continue;
      }
      if (isSentenceEnd(src, i)) {
        var j = skipTail(src, i);   // closing quotes, emphasis and dashes belong to the sentence
        var piece = src.slice(start, j).trim();
        if (piece) out.push(piece);
        while (src[j] === ' ' || src[j] === '\t') j++;
        start = j;
        i = j - 1;
      }
    }
    var tail = src.slice(start).trim();
    if (tail) out.push(tail);
    return out;
  }

  function syllables(word) {
    var w = String(word).toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    var groups = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
  }

  function readability(text) {
    var ws = sentences(text);
    var words = countWords(text);
    if (!ws.length || !words) return { ease: null, grade: null, words: words, sentences: ws.length };
    var syl = 0;
    String(text).split(/\s+/).forEach(function (tok) { syl += syllables(tok); });
    var ease = 206.835 - 1.015 * (words / ws.length) - 84.6 * (syl / words);
    var grade = 0.39 * (words / ws.length) + 11.8 * (syl / words) - 15.59;
    return {
      ease: Math.round(ease * 10) / 10,
      grade: Math.round(grade * 10) / 10,
      words: words,
      sentences: ws.length
    };
  }

  // ---------------------------------------------------------------- flags
  function findFlags(text, ruleset) {
    var RS = ruleset || DEFAULT_RULESET;
    var flags = [];
    var src = String(text || '');

    function push(rule, match, note, kind) {
      flags.push({
        rule: rule,
        match: match,
        note: note || '',
        kind: kind || 'phrase',
        index: src.indexOf(match)
      });
    }

    // 1. phrase rules (longest first, so an overlapping shorter rule is not counted twice)
    var claimed = [];
    function claimedSpan(index, length) {
      return claimed.some(function (r) { return index >= r[0] && index + length <= r[1]; });
    }
    RS.phrasesSorted.forEach(function (rule) {
      var re = wordRe(escapeRe(rule.from));
      var m;
      while ((m = re.exec(src)) !== null) {
        var at = m.index + m[1].length;            // m[1] is the boundary character, not the match
        if (claimedSpan(at, m[0].length - m[1].length)) {
          if (m.index === re.lastIndex) re.lastIndex++;
          continue;
        }
        claimed.push([at, at + m[0].length - m[1].length]);
        flags.push({
          rule: rule.from,
          to: rule.to,
          safe: rule.safe,
          match: m[0].slice(m[1].length),
          note: rule.note,
          kind: 'phrase',
          index: at
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });

    // spans already explained by a phrase rule should not be counted again
    var covered = flags.filter(function (f) { return f.kind === 'phrase'; })
      .map(function (f) { return [f.index, f.index + f.match.length]; });
    function insideSpan(index, length) {
      if (index == null) return false;
      return covered.some(function (r) { return index >= r[0] && index + length <= r[1]; });
    }

    // 2. long sentences
    var limit = RS.thresholds.longSentenceWords;
    sentences(src).forEach(function (s) {
      var n = countWords(s);
      if (n > limit) {
        flags.push({
          rule: 'long-sentence',
          match: s.slice(0, 60) + (s.length > 60 ? '…' : ''),
          note: n + ' words (limit ' + limit + ') — split it or cut a clause',
          kind: 'structure',
          words: n
        });
      }
    });

    // 3. passive voice (heuristic)
    var passive = wordRe('(is|are|was|were|be|been|being|am)\\s+(' + PARTICIPLES + ')');
    var pm;
    while ((pm = passive.exec(src)) !== null) {
      var pat = pm.index + pm[1].length;
      if (insideSpan(pat, pm[0].length - pm[1].length)) continue;
      // "I was tired" is a state, not a passive construction with a hidden actor
      if (ADJECTIVAL_PARTICIPLES.indexOf(pm[3].toLowerCase()) !== -1) continue;
      flags.push({
        rule: 'passive',
        match: pm[0],
        note: 'name the actor instead',
        kind: 'voice',
        index: pm.index
      });
    }

    // 4. intensifiers
    RS.intensifiers.forEach(function (word) {
      var re = wordRe(word);
      var m;
      while ((m = re.exec(src)) !== null) {
        var iat = m.index + m[1].length;
        if (insideSpan(iat, m[0].length - m[1].length)) { if (m.index === re.lastIndex) re.lastIndex++; continue; }
        flags.push({
          rule: 'intensifier',
          match: m[0].slice(m[1].length),
          note: 'cut it, or pick a stronger verb',
          kind: 'word',
          index: iat
        });
      }
    });

    // 5. slash-and-cadence problems
    if (/\s{2,}/.test(src)) {
      flags.push({ rule: 'double-space', match: 'multiple spaces', note: 'collapse to one', kind: 'format' });
    }
    var bullets = src.split(/\n/).filter(function (l) { return /^\s*[-*•]/.test(l); });
    if (bullets.length >= RS.thresholds.bulletWall) {
      flags.push({ rule: 'bullet-wall', match: bullets.length + ' bullets', note: 'a list this long reads as a wall', kind: 'structure' });
    }

    flags.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
    return flags;
  }

  // ---------------------------------------------------------------- trim
  function trim(text, opts, ruleset) {
    var RS = ruleset || DEFAULT_RULESET;
    var options = opts || {};
    var aggressive = !!options.aggressive; // applies non-safe phrase rules too
    var out = String(text || '');
    var applied = [];

    RS.phrasesSorted.forEach(function (rule) {
      if (!rule.safe && !aggressive) return;
      var re = wordRe(escapeRe(rule.from));
      out = out.replace(re, function (m, lead, offset) {
        var matched = m.slice(lead.length);
        applied.push({ from: matched, to: rule.to, rule: rule.from, safe: rule.safe });
        var rep = preserveCase(matched, rule.to);
        // A marker goes down only where a cut landed at the start of a sentence, so the capital
        // follows the cut and nothing else. A blanket pass used to "fix" prose that was never
        // touched: "Oh! don’t say that" became "Oh! Don’t say that" — not a cut, a rewrite.
        var start = offset + lead.length;
        var atStart = start === 0 || /[.!?]["'”’)]?\s*$/.test(out.slice(0, start));
        if (!rule.to) return lead + (atStart ? SENTINEL : '');
        return lead + (atStart ? SENTINEL : '') + rep;
      });
    });

    // whitespace tidy-up after any deletion
    out = out
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      // strip every leading stray mark at once: one-per-pass left trim() non-idempotent
      .replace(/^(?:\s*[,.;:!?])+/, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[ \t\r\n]+/, '')
      .replace(/[ \t\r\n]+$/, '');

    // capitalise only where this run actually deleted something, then drop the markers
    out = out.replace(new RegExp(SENTINEL + '\\s*([a-z])', 'g'), function (m, ch) {
      return SENTINEL + ch.toUpperCase();
    });
    out = out.replace(new RegExp(SENTINEL, 'g'), '');

    return { text: out, applied: applied };
  }

  // ---------------------------------------------------------------- rule sets
  // The built-in table is the default, not the only option. A rule set can be supplied as data
  // (JSON from disk, a per-site profile) so the words change without the code changing.
  function normalizeRules(list) {
    var errors = [], out = [];
    if (!Array.isArray(list)) return { rules: [], errors: ['rule set must be an array'] };
    list.forEach(function (raw, n) {
      if (!raw || typeof raw.from !== 'string' || !raw.from.trim()) {
        errors.push('rule ' + n + ': "from" must be a non-empty string'); return;
      }
      if (typeof raw.to !== 'string') {
        errors.push('rule ' + n + ' ("' + raw.from + '"): "to" must be a string (use "" to delete)'); return;
      }
      var from = raw.from.trim();
      if (/\s/.test(from) && from.split(/\s+/).length < 1) {
        errors.push('rule ' + n + ': "from" is only whitespace'); return;
      }
      out.push({
        from: from,
        to: raw.to,
        // a rule nobody declared safe cannot auto-cut. Unknown means dangerous.
        safe: raw.safe === true,
        note: typeof raw.note === 'string' ? raw.note : 'custom rule'
      });
    });
    var seen = {};
    out.forEach(function (r) {
      var k = r.from.toLowerCase();
      if (seen[k]) errors.push('duplicate rule: "' + r.from + '"');
      seen[k] = true;
    });
    return { rules: out, errors: errors };
  }

  function sortRules(rules) {
    return rules.slice().sort(function (a, b) { return b.from.length - a.from.length; });
  }

  var DEFAULT_THRESHOLDS = { longSentenceWords: 25, bulletWall: 4 };

  function normalizeThresholds(t) {
    var out = {};
    var keys = Object.keys(DEFAULT_THRESHOLDS);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = DEFAULT_THRESHOLDS[keys[i]];
    if (t === undefined || t === null) return { thresholds: out, errors: [] };
    if (typeof t !== 'object') return { thresholds: out, errors: ['thresholds must be an object'] };
    var errors = [];
    Object.keys(t).forEach(function (k) {
      if (keys.indexOf(k) === -1) { errors.push('unknown threshold: ' + k); return; }
      var v = t[k];
      if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 1) {
        errors.push('threshold ' + k + ' must be a positive integer'); return;
      }
      out[k] = v;
    });
    return { thresholds: out, errors: errors };
  }

  function makeRuleset(phrases, intensifiers, thresholds) {
    return {
      phrases: phrases.slice(),
      phrasesSorted: sortRules(phrases),
      intensifiers: Array.isArray(intensifiers) ? intensifiers.slice() : INTENSIFIERS.slice(),
      thresholds: thresholds || DEFAULT_THRESHOLDS
    };
  }

  var DEFAULT_RULESET = makeRuleset(PHRASES, INTENSIFIERS, DEFAULT_THRESHOLDS);

  // ---------------------------------------------------------------- analysis
  // The biggest number in a note, used to pick the worst-case note for a repeated rule.
  function worstNumber(note) {
    var m = String(note || '').match(/\d+/g);
    return m ? Math.max.apply(null, m.map(Number)) : -1;
  }

  function analyze(text, opts, ruleset) {
    var RS = ruleset || DEFAULT_RULESET;
    var options = opts || {};
    var source = String(text || '');
    var result = trim(source, options, RS);
    var flags = findFlags(source, RS);
    var read = readability(result.text);
    var byRule = {};
    flags.forEach(function (f) {
      var key = f.rule;
      var cur = byRule[key];
      if (!cur) { byRule[key] = { rule: key, note: f.note, kind: f.kind, count: 1, safe: f.safe }; return; }
      cur.count++;
      // A rule that fires several times with different numbers used to report the first one:
      // "long-sentence ×2 — 27 words (limit 25)" next to a 65-word sentence understated the worst
      // case, which is the one number a writer needs. Keep the worst.
      if (worstNumber(f.note) > worstNumber(cur.note)) cur.note = f.note;
    });

    return {
      original: source,
      trimmed: result.text,
      applied: result.applied,
      flags: flags,
      issues: Object.keys(byRule).map(function (k) { return byRule[k]; })
        .sort(function (a, b) { return b.count - a.count; }),
      // two denominators on purpose: a ratio about *writing* belongs to the original text, and a
      // ratio about the tool's effect belongs to the trimmed one. Measuring sentences on the
      // trimmed text alone made corpus counts move when trim changed.
      sentencesBefore: sentences(source).length,
      sentencesAfter: sentences(result.text).length,
      wordsBefore: countWords(source),
      wordsAfter: countWords(result.text),
      charsBefore: source.length,
      charsAfter: result.text.length,
      readability: read,
      longestSentence: sentences(source).reduce(function (acc, s) {
        var n = countWords(s);
        return n > acc.words ? { words: n, text: s } : acc;
      }, { words: 0, text: '' })
    };
  }

  function budgetFor(id) {
    for (var i = 0; i < BUDGETS.length; i++) if (BUDGETS[i].id === id) return BUDGETS[i];
    return null;
  }

  function budgetStatus(id, text) {
    var b = budgetFor(id);
    if (!b) return null;
    var len = String(text || '').length;
    return {
      id: b.id, label: b.label, max: b.max, hint: b.hint,
      length: len, over: Math.max(0, len - b.max),
      ratio: Math.min(1, len / b.max), fits: len <= b.max
    };
  }

  function create(spec) {
    var s = spec || {};
    var list = s.phrases;
    if (s.extend) {
      // Extending should not require copying the whole built-in table.
      // Redefining a built-in rule in an extending set overrides it instead of erroring.
      var mine = {};
      (s.phrases || []).forEach(function (x) {
        if (x && typeof x.from === 'string') mine[x.from.trim().toLowerCase()] = true;
      });
      list = PHRASES.filter(function (p) { return !mine[p.from.toLowerCase()]; }).concat(s.phrases || []);
    }
    var res = normalizeRules(list);
    var th = normalizeThresholds(s.thresholds);
    var errors = res.errors.concat(th.errors);
    if (errors.length) throw new Error('invalid rule set: ' + errors.join('; '));
    var RS = makeRuleset(res.rules, s.intensifiers, th.thresholds);
    return {
      version: api.version,
      name: typeof s.name === 'string' ? s.name : (s.extend ? 'extended' : 'custom'),
      extended: !!s.extend,
      PHRASES: RS.phrases,
      INTENSIFIERS: RS.intensifiers,
      ruleCount: RS.phrases.length,
      thresholds: RS.thresholds,
      trim: function (text, opts) { return trim(text, opts, RS); },
      findFlags: function (text) { return findFlags(text, RS); },
      analyze: function (text, opts) { return analyze(text, opts, RS); },
      budgetStatus: budgetStatus,
      budgetFor: budgetFor,
      readability: readability,
      countWords: countWords,
      sentences: sentences
    };
  }

  var api = {
    version: '0.3.6',
    create: create,
    normalizeRules: normalizeRules,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    PHRASES: PHRASES,
    INTENSIFIERS: INTENSIFIERS,
    BUDGETS: BUDGETS,
    analyze: analyze,
    trim: trim,
    findFlags: findFlags,
    countWords: countWords,
    sentences: sentences,
    syllables: syllables,
    readability: readability,
    budgetFor: budgetFor,
    budgetStatus: budgetStatus
  };

  global.Trimline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
