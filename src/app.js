/* Trimline UI glue. Thin by design: all judgement lives in rules.js. */
(function () {
  'use strict';
  var T = window.Trimline;
  var el = function (id) { return document.getElementById(id); };
  var state = { last: null, budget: 'x-post', engine: T };
  var SAMPLE_DRAFT = 'In order to make the tool useful, it should be noted that there are a lot of ' +
    'reasons why we decided to do it on a daily basis. The approach was built by a small ' +
    'team in order to reduce the number of very small failures that occur each and every day.';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderStats(a) {
    var items = [
      ['words', a.wordsBefore + ' → ' + a.wordsAfter],
      ['chars', a.charsBefore + ' → ' + a.charsAfter],
      ['sentences', a.sentencesBefore],
      ['longest', a.longestSentence.words + 'w'],
      ['reading ease', a.readability.ease === null ? '—' : a.readability.ease],
      ['grade', a.readability.grade === null ? '—' : a.readability.grade],
      ['findings', a.flags.length]
    ];
    el('stats').innerHTML = items.map(function (p) {
      return '<div class="stat"><b>' + esc(p[1]) + '</b><small>' + esc(p[0]) + '</small></div>';
    }).join('');
  }

  function renderBudget(a) {
    var b = state.engine.budgetStatus(state.budget, a.trimmed);
    if (!b) return;
    var bar = el('budgetBar');
    bar.style.width = Math.round(b.ratio * 100) + '%';
    bar.className = b.over > 0 ? 'bad' : (b.ratio > 0.85 ? 'warn' : '');
    el('budgetText').textContent = b.length + ' / ' + b.max +
      (b.over > 0 ? ' — cut ' + b.over + ' more' : ' — fits') + ' · ' + b.hint;
  }

  function renderFlags(a) {
    var html = a.issues.map(function (i) {
      var cls = i.kind === 'phrase' ? (i.safe ? 'safe' : 'maybe') : '';
      var label = i.kind === 'phrase' ? (i.safe ? 'safe cut' : 'maybe') : i.kind;
      return '<li class="flag ' + cls + '"><span class="tag">' + esc(label) + '</span>' +
        '<span class="m">' + esc(i.rule) + '</span> ×' + i.count +
        '<div class="n">' + esc(i.note || '') + '</div></li>';
    }).join('');
    el('flags').innerHTML = html || '<li class="flag"><span class="n">Nothing to cut. Ship it.</span></li>';
  }

  function render() {
    var src = el('src').value;
    if (!src.trim()) {
      el('stats').innerHTML = '';
      el('flags').innerHTML = '';
      el('out').textContent = '';
      el('status').textContent = '';
      el('budgetBar').style.width = '0%';
      el('budgetText').textContent = '';
      return null;
    }
    var a = state.engine.analyze(src, { aggressive: false });
    state.last = a;
    renderStats(a);
    renderBudget(a);
    renderFlags(a);
    el('out').textContent = a.trimmed;
    var saved = a.charsBefore - a.charsAfter;
    el('status').textContent = saved > 0
      ? 'Safe cuts would remove ' + saved + ' characters (' +
        Math.round((saved / a.charsBefore) * 100) + '%).'
      : 'No safe cuts found — the text is already lean.';
    return a;
  }

  function applyCut(aggressive) {
    var src = el('src').value;
    if (!src.trim()) return;
    var r = state.engine.trim(src, { aggressive: aggressive });
    if (r.text === src) {
      el('status').textContent = aggressive
        ? 'Already trimmed. Nothing left that the rules recognise.'
        : 'No safe cuts found. Try "Apply everything" to see the riskier ones.';
      return;
    }
    state.prev = src;
    el('src').value = r.text;
    render();
    el('status').textContent = 'Applied ' + r.applied.length + ' change' +
      (r.applied.length === 1 ? '' : 's') + '. Undo is available.';
  }

  function downloadCard() {
    var a = state.last || render();
    if (!a) { el('status').textContent = 'Type or paste something first.'; return; }
    var c = document.createElement('canvas');
    c.width = 1600; c.height = 900;
    var x = c.getContext('2d');
    x.fillStyle = '#0e1116'; x.fillRect(0, 0, 1600, 900);
    x.fillStyle = '#ffd23f'; x.fillRect(90, 90, 12, 110);
    x.fillStyle = '#e8edf2';
    x.font = '650 64px ui-sans-serif, system-ui, sans-serif';
    x.fillText('Trimline', 130, 155);
    x.fillStyle = '#93a0af';
    x.font = '400 30px ui-sans-serif, system-ui, sans-serif';
    x.fillText('cut the flab, keep the meaning', 132, 200);

    x.fillStyle = '#e8edf2';
    x.font = '700 130px ui-monospace, Menlo, monospace';
    var before = String(a.wordsBefore), after = String(a.wordsAfter);
    x.fillText(before, 130, 400);
    x.fillStyle = '#93a0af'; x.fillText('→', 130 + x.measureText(before).width + 40, 400);
    x.fillStyle = '#ffd23f';
    x.fillText(after, 130 + x.measureText(before).width + 130, 400);
    x.fillStyle = '#93a0af';
    x.font = '400 26px ui-sans-serif, system-ui, sans-serif';
    x.fillText('words ' + a.wordsBefore + ' → ' + a.wordsAfter +
      ' · longest sentence ' + a.longestSentence.words + ' words', 132, 445);

    // percentage block, mirroring tools/make_card.py (the reference layout)
    var cut = Math.max(0, a.charsBefore - a.charsAfter);
    var pct = a.charsBefore ? Math.round((cut / a.charsBefore) * 100) : 0;
    x.fillStyle = '#ffd23f';
    x.font = '700 92px ui-monospace, Menlo, monospace';
    var pctLabel = '−' + pct + '%';
    x.fillText(pctLabel, 1600 - 130 - x.measureText(pctLabel).width, 400);
    x.fillStyle = '#93a0af';
    x.font = '400 26px ui-sans-serif, system-ui, sans-serif';
    x.fillText('characters removed', 1600 - 130 - x.measureText('characters removed').width, 445);

    // proportion bars
    var maxW = 1340;
    var wb = a.charsBefore ? Math.max(40, (a.charsBefore / Math.max(a.charsBefore, 1)) * maxW) : 0;
    var wa = a.charsAfter ? Math.max(40, (a.charsAfter / Math.max(a.charsBefore, 1)) * maxW) : 0;
    x.fillStyle = '#2a313c'; x.fillRect(132, 510, wb, 26);
    x.fillStyle = '#ffd23f'; x.fillRect(132, 552, wa, 26);

    // bounded row count. Rows run 690/730/770/810 and the footer sits at 850, so a 5th line
    // (the overflow line) used to print straight over the footer. Cap at 3 rows when overflow needs
    // a line of its own — the same clamp the Python reference card already had.
    var cap = a.issues.length > 4 ? 3 : 4;
    var top = a.issues.slice(0, cap);
    var overflow = Math.max(0, a.issues.length - cap);
    x.fillStyle = '#93a0af';
    x.font = '400 24px ui-sans-serif, system-ui, sans-serif';
    x.fillText(top.length ? 'main patterns found' : 'main patterns found', 132, 640);
    x.fillStyle = '#e8edf2';
    x.font = '400 34px ui-monospace, Menlo, monospace';
    top.forEach(function (i, n) {
      var auto = i.kind === 'phrase' && i.safe !== false;
      x.fillText('· ' + i.rule + '  ×' + i.count + (auto ? '  (auto-cut)' : '  (flagged only)'),
        150, 690 + n * 40);
    });
    if (overflow) {
      x.fillStyle = '#93a0af';
      // one row below the last drawn row, not a hardcoded index that used to land on the footer
      x.fillText('+ ' + overflow + ' more pattern' + (overflow > 1 ? 's' : ''), 150, 690 + top.length * 40);
    }

    x.fillStyle = '#93a0af';
    x.font = '400 24px ui-sans-serif, system-ui, sans-serif';
    x.fillText('rules engine v' + T.version + ' · offline · no text leaves the page', 132, 850);

    // QA hook: open the page with #cardpreview and the card is drawn into the document instead of
    // being handed to the browser as a download. The canvas is otherwise invisible, and "it called
    // toDataURL" is not the same as "the card is legible" — this is how that got checked.
    if (typeof location !== 'undefined' && /cardpreview/.test(location.hash || '')) {
      var old = document.querySelector('[data-card-preview]');
      if (old) old.remove();
      c.setAttribute('data-card-preview', '1');
      c.style.cssText = 'display:block;width:100%;height:auto;background:#0e1116';
      document.body.appendChild(c);
      el('status').textContent = 'Card drawn in page (preview mode).';
      return;
    }

    var link = document.createElement('a');
    link.download = 'trimline-card.png';
    link.href = c.toDataURL('image/png');
    link.click();
    el('status').textContent = 'Share card downloaded (1600×900).';
  }

  function init() {
    if (!T) { el('status').textContent = 'rules.js failed to load'; return; }
    el('ver').textContent = T.version;
    el('ruleCount').textContent = T.PHRASES.length;
    el('rulesetStatus').textContent = 'built-in table (' + T.PHRASES.length + ' rules)';
    el('budget').innerHTML = T.BUDGETS.map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.label) + ' (' + b.max + ')</option>';
    }).join('');
    el('budget').value = state.budget;

    var t = el('src');
    if (!t.value.trim()) t.value = SAMPLE_DRAFT;
    t.addEventListener('input', render);
    el('budget').addEventListener('change', function (e) { state.budget = e.target.value; render(); });
    el('apply').addEventListener('click', function () { applyCut(false); });
    el('aggressive').addEventListener('click', function () { applyCut(true); });
    el('undo').addEventListener('click', function () {
      if (typeof state.prev === 'string') { el('src').value = state.prev; render(); }
    });
    el('copy').addEventListener('click', function () {
      var out = (state.last && state.last.trimmed) || '';
      if (!out) return;
      navigator.clipboard.writeText(out).then(
        function () { el('status').textContent = 'Trimmed text copied.'; },
        function () { el('status').textContent = 'Clipboard blocked — select the box and copy manually.'; }
      );
    });
    el('card').addEventListener('click', downloadCard);
    el('clear').addEventListener('click', function () { el('src').value = ''; render(); t.focus(); });
    el('loadrules').addEventListener('click', function () {
      var raw = el('ruleset').value;
      if (!raw.trim()) { el('rulesetStatus').textContent = 'Paste a rule set as JSON first.'; return; }
      var spec;
      try { spec = JSON.parse(raw); } catch (e) {
        el('rulesetStatus').textContent = 'not valid JSON: ' + e.message; return;
      }
      try {
        state.engine = T.create(Array.isArray(spec) ? { phrases: spec } : spec);
        el('rulesetStatus').textContent = 'loaded "' + state.engine.name + '" (' +
          state.engine.ruleCount + ' rules)';
        render();
      } catch (e) {
        state.engine = T;
        el('rulesetStatus').textContent = e.message;
        render();
      }
    });
    el('resetrules').addEventListener('click', function () {
      state.engine = T; el('ruleset').value = '';
      el('rulesetStatus').textContent = 'built-in table (' + T.PHRASES.length + ' rules)';
      render();
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); applyCut(false); }
    });
    render();
  }

  window.TrimelineUI = { render: render, applyCut: applyCut, downloadCard: downloadCard, state: state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
