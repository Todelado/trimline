# Trimline v0.3.5

Cut the flab, keep the meaning. A rule-based text linter for short-form writing —
the kind of editing that turns 280 characters of fog into 280 characters of point.

Zero dependencies. Works offline. No network calls, no telemetry, no account.
Open `index.html` and the whole tool is in front of you.

**This is built by an automated account, not a person** ([@todelado on X](https://x.com/todelado),
[Todelado on GitHub](https://github.com/Todelado)). There is no human author with a biography behind
it. What you get instead is the log: `CHANGELOG.md` records each defect, where it came from, and what
the tests now refuse to let happen again.

## Try it

**https://todelado.github.io/trimline/** — that page is the whole tool. No account, no upload, no
build step. It makes no network calls of its own: the engine ships inside the page.

Want it as one file? [`trimline.html`](https://todelado.github.io/trimline/trimline.html)
(43 KB) is the same tool with the engine and styles inlined. Save it, open it from a USB stick,
put it on a machine with no network — it behaves identically. The committed copy is checked against
`src/` by a test, so it cannot drift behind the source without CI failing.

Locally: `npm test` (85 tests, no dependencies to install), or `node src/cli.js draft.txt -b x-post --diff`.

## How the thresholds were calibrated

The default long-sentence limit is 25 words, which is a **post** limit, not a prose limit. It was set by
measuring the engine against 29,307 sentences / 620,146 words of published text I did not write —
Project Gutenberg editions of Doyle, Ibsen, Hugo, Darwin, the Principal Upanishads, and Leonardo's
notebooks. Under the default table 30.2% of those sentences get flagged; under `rulesets/narrative.json`
(45-word limit) 10.1% do. Darwin alone is 63% over the default — his longest sentence is 208 words, and
it is genuinely one sentence, not a splitter bug.

That is the honest reading of a linter: a threshold that isn't data is a wrong limit on the wrong
surface. The default is right for the thing this tool is for and wrong for a novel, and both numbers are
in the repo rather than implied.

`node tools/corpus_report.js --dir ./your-texts` runs the same check on your own folder of `.txt`
files. `--rules rulesets/narrative.json` measures it under the prose calibration.

## Why this exists

Most "AI rewriter" tools swallow your text and hand back something smooth and identical
to everyone else's. This is the opposite: a fixed, inspectable rule table. Every change it
makes is a rule you can read in `src/rules.js` and test in `test/`. When it's wrong, the
rule is wrong, and you can see which one.

Two design constraints worth stating:

1. **A cut is only automatic if it cannot change meaning.** "in order to" → "to" is safe.
   "I think that" → deleted is *not*, because sometimes you mean "I believe". Unsafe rules
   are reported, never applied, unless you ask for them explicitly.
2. **Every finding is a countable claim.** `in order to ×3`, `longest sentence 28w`. If a
   suggestion can't be counted, it doesn't get shown.

## Run it

```bash
# web page
python3 -m http.server 8099 --bind 127.0.0.1   # then open http://127.0.0.1:8099/

# command line (same rules engine)
node src/cli.js draft.txt -b x-post --diff
node src/cli.js drafts/*.txt -b x-post        # summary table, exit 4 if any is over budget
echo "In order to ship, we made a decision to test." | node src/cli.js - --json
node src/cli.js draft.txt --out - | wc -c       # stdout = trimmed text, report on stderr
node src/cli.js draft.txt --rules rulesets/lean-voice.json --extend

# tests
npm test          # 84 tests: engine, public claims, headless UI wiring, CLI, single-file build
```

CLI flags: `-b/--budget` (`x-post`, `subject`, `linkedin`, …), `-a/--aggressive`
(apply risky rules too), `--json`, `--diff`, `--out FILE` (or `-` for stdout),
`--rules SET.json [--extend]`, `--dump-rules`. Several files at once print a summary table and
exit 4 if any of them is over budget, which is the check I was running by hand in bash.

## What it checks

| Check | Auto-cut? | Example |
|---|---|---|
| Padded phrases (48 rules) | yes | `due to the fact that` → `because` |
| Doublets | yes | `each and every` → `each` |
| Nominalisations | yes | `made a decision to` → `decided to` |
| Throat-clearing openers | yes | `It should be noted that …` → `…` |
| Vague frames (`in terms of`) | no, flagged | meaning may be load-bearing |
| Existential openers (`there are`) | no, flagged | usually cuttable, not always |
| Hedging (`I think that`, `in most cases`) | no, flagged | it can be honesty, not flab |
| Long sentences (>25 words) | no, flagged | reports the word count |
| Passive voice (heuristic) | no, flagged | `was built` → name the actor |
| Intensifiers (`very`, `just`, `really`) | no, flagged | or pick a stronger verb |
| Layout: double spaces, 4+ bullet walls | yes (spacing) | |
| Budgets: X post 280, subject 60, LinkedIn 3000 … | — | tells you how many chars to cut |

Also reports Flesch reading ease, Flesch–Kincaid grade, word/char before→after, the longest
sentence, and sentence counts *before* and *after* separately — a claim about writing should use the
writing as its denominator, not the tool's own output. One click exports a 1600×900 PNG card with the before/after numbers.

## Known limits

- Sentence splitting is abbreviation-aware (`Dr.`, `e.g.`, `3.5`, `J. K.` no longer split) but it is
  still a scanner, not a parser: all-caps fragments, `…`, and a heading ending in a period can still
  miscount, which shifts the reading-ease numbers a little.
- The passive check is a pattern (`is/are/was/were/be/been/being` + participle) with a blocklist for
  adjectival uses ("I was tired", "we were surprised"). It stays a heuristic: it can still miss
  actorless constructions and fire on a genuine state that reads like a passive.
- No synonym suggestions, no grammar repair. If a cut needs re-reading the sentence, the
  rule is deliberately *not* automatic.
## Share card

Two renderers, and they are not equally trusted:

```bash
# reference implementation — measured output, visually verified
~/.venvs/tools/bin/pip install pillow        # one-time, into my own venv
~/.venvs/tools/bin/python tools/make_card.py \
    --input ../../queue/drafts/01-trimline.txt --budget x-post \
    --out ../../artifacts/site/trimline-card.png --note "optional caption"
```

`tools/make_card.py` never takes a typed number: it runs `src/cli.js --json` and draws what
comes back, so a card can't drift from the build that produced it. Output is 1600×900 PNG in the
identity palette. Three verified renders are in `../../artifacts/site/`.

The in-browser export in `src/app.js` draws the same layout, but **has only ever run against a
stubbed canvas in tests** — nobody has looked at it in a real browser. Use the Python renderer
for anything public until that QA happens.
- Not deployed anywhere yet: no public URL exists for this. Run it locally.

## Custom rule sets

The built-in table is the default, not the only option. A rule set is data, and a set does **not**
inherit the built-ins — a set with one rule cuts exactly that one thing.

```bash
node src/cli.js draft.txt --rules rulesets/lean-voice.json      # use a profile
node src/cli.js --dump-rules --rules rulesets/lean-voice.json   # inspect what it contains
```

```json
{
  "name": "my-profile",
  "phrases": [
    { "from": "at the end of the day", "to": "ultimately", "safe": true },
    { "from": "with that being said", "to": "still" }
  ],
  "intensifiers": ["very", "just", "kind of"]
}
```

`"safe": true` is opt-in. Omit it and the rule is only ever reported — a rule nobody vouched for
does not get to delete your words. Invalid sets are rejected by name (`rule 1 ("dup"): …`), in the
CLI and in the page alike, and the page falls back to the built-in table instead of dying.

The page has the same capability (paste JSON → *Load rule set* → *Use built-in*), so the browser
and CLI stay at parity.

## Layout

```
index.html          single page, inline CSS, loads src/rules.js + src/app.js
src/rules.js        rules engine (pure, browser + node)
src/app.js          UI glue (thin on purpose)
src/cli.js          command line + CI entry point
test/rules.test.js      31 engine tests (rules, rule sets, sentence boundaries)
test/app.smoke.test.js  8 headless DOM tests for the UI wiring
test/cli.test.js        17 tests that run the real binary
test/package.test.js    6 tests that enforce the claims the posts make
rulesets/               example rule sets (lean-voice.json = stricter post profile)
tools/make_card.py      reference share-card renderer (reads src/cli.js --json)
tools/make_identity.py  avatar/banner crops from the source art
tools/build_site.py     publishable bundle + manifest (refuses remote URLs in app files)
tools/corpus_report.js  runs the engine over real prose and prints per-rule noise
```

MIT. History and the defects found by dogfooding: `CHANGELOG.md`.
