'use strict';
/* Headless smoke test for src/app.js using a minimal fake DOM.
   Purpose: catch wiring mistakes (typos, missing ids, crashes) without a browser. */
const test = require('node:test');
const assert = require('node:assert');

function makeEl(id) {
  return {
    id: id, value: '', innerHTML: '', textContent: '', className: '',
    style: {}, href: '', download: '', listeners: {},
    addEventListener: function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    focus: function () {},
    click: function () { this.clicked = true; }
  };
}

function installDom(initialText) {
  const els = {};
  const ids = ['src', 'stats', 'flags', 'out', 'status', 'budget', 'budgetBar', 'budgetText',
    'ver', 'ruleCount', 'apply', 'aggressive', 'undo', 'copy', 'card', 'clear',
    'ruleset', 'loadrules', 'resetrules', 'rulesetStatus'];
  ids.forEach(function (id) { els[id] = makeEl(id); });
  els.src.value = initialText || '';
  els.budgetBar.className = '';

  global.window = global;
  global.document = {
    readyState: 'complete',
    getElementById: function (id) { return els[id] || null; },
    addEventListener: function () {},
    createElement: function (tag) {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: function () {
            return {
              fillStyle: '', font: '',
              fillRect: function () {},
              fillText: function (t, x, y) { (global.__drawn = global.__drawn || []).push({ text: String(t), x: x, y: y }); },
              measureText: function (s) { return { width: String(s).length * 8 }; }
            };
          },
          toDataURL: function () { return 'data:image/png;base64,STUB'; },
          setAttribute: function () {},
          style: {}
        };
      }
      return makeEl(tag);
    },
    querySelector: function () { return null; },
    body: { appendChild: function (n) { (global.__appended = global.__appended || []).push(n); } }
  };
  global.__appended = [];
  global.__drawn = [];
  global.location = { hash: '' };
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: null }, configurable: true, writable: true
  });
  return els;
}

function loadApp(els) {
  delete require.cache[require.resolve('../src/rules.js')];
  delete require.cache[require.resolve('../src/app.js')];
  require('../src/rules.js');           // attaches to globalThis as window alias
  require('../src/app.js');
  return global.TrimelineUI;
}

test('app renders stats, budget, findings and output', () => {
  const els = installDom('In order to ship it, it should be noted that we made a decision to test everything each and every day.');
  const ui = loadApp(els);
  ui.render();
  assert.match(els.stats.innerHTML, /words/);
  assert.match(els.stats.innerHTML, /findings/);
  assert.match(els.out.textContent, /^To ship it/);
  assert.match(els.flags.innerHTML, /in order to/);
  assert.match(els.status.textContent, /Safe cuts would remove/);
  assert.match(els.budgetBar.style.width, /%$/);
});

test('empty draft clears the panel instead of crashing', () => {
  const els = installDom('');
  const ui = loadApp(els);      // init() seeds the sample draft for a first visit
  assert.match(els.src.value, /In order to make the tool useful/);
  els.src.value = '';
  ui.render();
  assert.equal(els.stats.innerHTML, '');
  assert.equal(els.out.textContent, '');
  assert.equal(els.budgetBar.style.width, '0%');
});

test('apply safe cuts rewrites the draft and undo restores it', () => {
  const els = installDom('We did it in order to save time.');
  const ui = loadApp(els);
  ui.render();
  ui.applyCut(false);
  assert.equal(els.src.value, 'We did it to save time.');
  assert.match(els.status.textContent, /Applied 1 change/);
  ui.applyCut(false); // idempotent second pass
  assert.match(els.status.textContent, /No safe cuts found/);
  els.undo.listeners.click[0]();
  assert.equal(els.src.value, 'We did it in order to save time.');
});

test('budget selector switches limits', () => {
  const els = installDom('x'.repeat(80));
  const ui = loadApp(els);
  ui.render();
  els.budget.listeners.change[0]({ target: { value: 'subject' } });
  ui.render();
  assert.match(els.budgetText.textContent, /cut 20 more/);
  assert.equal(els.budgetBar.className, 'bad');
});

test('loading a custom rule set replaces the table for the page', () => {
  const els = installDom('At the end of the day, in order to ship it.');
  const ui = loadApp(els);
  ui.render();
  // built-in table cuts "in order to" and has no rule for the cliché
  assert.equal(els.out.textContent, 'At the end of the day, to ship it.');
  els.ruleset.value = JSON.stringify({
    name: 'cliches', phrases: [{ from: 'at the end of the day', to: 'ultimately', safe: true }]
  });
  els.loadrules.listeners.click[0]();
  assert.match(els.rulesetStatus.textContent, /loaded "cliches" \(1 rules\)/);
  assert.match(els.out.textContent, /^Ultimately, in order to ship it\./,
    'custom table cuts its own rule and leaves the built-in one alone');
  els.resetrules.listeners.click[0]();
  assert.equal(els.out.textContent, 'At the end of the day, to ship it.',
    'reset returns to the built-in table');
});

test('a bad rule set is reported and the engine stays usable', () => {
  const els = installDom('In order to ship it.');
  const ui = loadApp(els);
  ui.render();
  els.ruleset.value = '{not json';
  els.loadrules.listeners.click[0]();
  assert.match(els.rulesetStatus.textContent, /not valid JSON/);
  assert.match(els.out.textContent, /To ship it/, 'analysis keeps working on the built-in table');
  els.ruleset.value = JSON.stringify({ phrases: [{ to: 'x' }] });
  els.loadrules.listeners.click[0]();
  assert.match(els.rulesetStatus.textContent, /invalid rule set/);
  assert.match(els.out.textContent, /To ship it/);
});

test('share card download runs without throwing', () => {
  const els = installDom('In order to test this, we made a decision to cut copy.');
  const ui = loadApp(els);
  ui.render();
  ui.downloadCard();
  assert.match(els.status.textContent, /Share card downloaded/);
});

test('copy button reports clipboard state', async () => {
  const els = installDom('In order to test this we cut copy.');
  const ui = loadApp(els);
  ui.render();
  let copied = null;
  navigator.clipboard = { writeText: function (t) { copied = t; return Promise.resolve(); } };
  els.copy.listeners.click[0]();
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(copied, 'To test this we cut copy.');
  assert.equal(els.status.textContent, 'Trimmed text copied.');
});

test('#cardpreview draws the card into the page instead of handing it to the browser', () => {
  const els = installDom('It should be noted that in order to ship it we made a decision on a daily basis.');
  const ui = loadApp(els);
  global.location.hash = '#cardpreview';
  global.__appended = [];
  global.__drawn = [];
  ui.downloadCard();
  assert.equal(global.__appended.length, 1, 'the canvas should have been appended to the document');
  assert.equal(els.status.textContent, 'Card drawn in page (preview mode).');
  global.location.hash = '';
});

test('the card overflow line stays clear of the footer', () => {
  // the sample draft has 8 distinct rules, so the card needs a "+N more patterns" line —
  // which used to be drawn at the footer's own y and printed straight over it
  const els = installDom('In order to make the tool useful, it should be noted that there are a lot of ' +
    'reasons why we decided to do it on a daily basis. The approach was built by a small team in order ' +
    'to reduce the number of very small failures that occur each and every day.');
  const ui = loadApp(els);
  global.__drawn = [];
  ui.downloadCard();
  const drawn = global.__drawn;
  const footer = drawn.filter(function (d) { return /^rules engine/.test(d.text); });
  const overflow = drawn.find(function (d) { return /^\+ \d+ more pattern/.test(d.text); });
  assert.ok(overflow, 'expected an overflow line for a draft with 8 rules');
  assert.ok(footer.length, 'expected a footer line');
  assert.ok(overflow.y <= footer[0].y - 40,
    'overflow line at y=' + overflow.y + ' collides with footer at y=' + footer[0].y);
  const rows = drawn.filter(function (d) { return /^· /.test(d.text); });
  assert.ok(rows.length <= 3 || !overflow, 'rows + overflow must fit above the footer');
});
