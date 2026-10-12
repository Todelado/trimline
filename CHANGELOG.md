# Changelog — Trimline

## v0.1 — 2026-10-12 (first build)

Built in one sitting from a dogfooding need: my own drafts were padded and I wanted a
linter that shows its work instead of silently rewriting them.

Added
- Rules engine `src/rules.js`: 48 phrase rules tagged safe/risky, long-sentence,
  passive-voice heuristic, intensifier flags, double-space and bullet-wall checks.
- Word/char before→after, Flesch reading ease, Flesch–Kincaid grade, longest sentence.
- Budget mode: X post (280), X thread step (250), email subject (60), push (120),
  README tagline (140), LinkedIn (3000), PR description (1000).
- Web page (`index.html`) with live analysis, Apply-safe-cuts / Apply-everything, undo,
  copy, and a 1600×900 PNG share card drawn on canvas.
- CLI (`src/cli.js`) with `--json`, `--diff`, `-b/--budget`, `-a/--aggressive`, `--out`.
- Tests: 15 engine tests + 6 headless-DOM smoke tests (21 passing, `npm test`).
- Refuses to block on a TTY with no input (a hang I actually hit while building it).

Fixed during this build
- Deleted openers left the sentence lowercase: capitalisation now restored after deletion.
- `in order to` was matching inside itself; phrase table now applies longest-first.
- Leading whitespace survived a deleted opener; edges now tidied before capitalisation.

Deliberately not in v0.1
- No synonym "improvements", no model calls, no upload. See README limits.

## v0.1.1 — 2026-10-12 (found by using it on my own drafts)

I wrote five deliberately padded first drafts of my own posts and ran them through the tool.
Four defects showed up within minutes, all of them things a spec would have missed:

- **Double counting.** "It should be noted that …" was counted twice — once as a
  throat-clearing phrase, once as passive voice. Findings now suppress any match contained in
  a phrase rule's span. The pinned-post draft dropped from 3 passive hits to 2.
- **Wrong capitalisation.** Deleting an opener and then re-capitalising after a colon turned
  "automated: a builder" into "automated: A builder". Colons no longer force a capital.
- **A doublet that changed meaning.** "each and every other candidate" collapsed to "each
  other candidate" — a different sentence. Now matched as its own rule → "every other".
- **A phantom cut.** Running on a file reported "-1 characters" because the file's trailing
  newline was counted as deleted text. Trailing newline is no longer counted, so the numbers
  in the report are all real cuts.
- Overlapping phrase rules are matched longest-first and claimed, so "each and every other"
  is reported once, not twice.
- **The documented stdin path did not work.** The README said `echo "..." | trimline -` and the
  argument parser rejected `-`. It works now, and there are 7 CLI-level tests around it
  (`test/cli.test.js`) covering `--help`, file input, piped stdin, `--json`, missing file,
  unknown option, and the newline count.
- `--out -` writes the trimmed text to stdout and moves the report to stderr, so the CLI can
  sit in a pipe: `trimline draft.txt --out - | wc -c` returns text, not a report.

Tests: 21 → 34, all passing. Phrase rules: 48 (38 safe, 10 flagged-only).

Also added in this increment
- `--json` now carries `version`, `ruleCount` and `longestSentence`, so a measurement can be
  attributed to the build that produced it.
- `tools/make_card.py`: reference share-card renderer (1600×900 PNG). It calls the real engine
  and draws the returned numbers — no hand-typed figures, so a card cannot disagree with a build.
- Visual QA on three rendered cards found and fixed: a finding row overlapping the footer rule
  (now 4 rows + an overflow line), `passive` rendering with no kind label (everything is now
  either "auto-cut" or "flagged only"), and a fixed-width recolour rectangle that would have
  clipped 4-digit counts (now measured).
- The in-browser canvas export was rewritten to match the verified layout, and is still marked
  unverified — it has only run against a stubbed canvas.

## v0.2.0 — 2026-10-12 — rule sets as data

The phrase table was hardcoded in `src/rules.js`, which meant "edit the rules" meant "edit the
code". Now a rule set is data:

- `Trimline.create(spec)` builds an isolated engine from a rule set. Custom sets do **not**
  inherit the built-ins — a set with one rule cuts exactly that one thing.
- Fail-safe default: a rule is auto-applied only if it declares `"safe": true`. Omit it and the
  rule is reported, never applied. Unknown means dangerous.
- Validation rejects a missing/blank `from`, a non-string `to`, duplicate rules and a
  non-array set — with messages that name the rule (`rule 2 ("check it out"): ...`).
- CLI: `--rules SET.json` and `--dump-rules` (prints the active table so you can inspect what a
  set actually contains instead of trusting the file).
- `rulesets/lean-voice.json` — my own stricter profile for short-form posts.
- The web page has a rule-set box: paste JSON, load it, reset to built-in. A bad set reports the
  error and the page keeps working on the built-in table.

Tests: 34 → 44 (engine 22, UI 8, CLI 8 — `--rules`, `--dump-rules`, broken-set and isolation
covered). Version reported by `--json`, `--dump-rules` and the card renderer.

## v0.2.1 — 2026-10-12 — two gaps I hit myself

- `--extend`: adding one rule used to mean copying all 48. An extending set now merges with the
  built-ins, and **redefining a built-in rule overrides it** rather than colliding. A rule set can
  declare `"extend": true` in the file itself. Duplicates are still rejected in plain replace mode.
- Several files at once now print a summary table and exit **4** if any file is over budget.
  I had been writing this loop in bash for my own drafts, which is the only reason I noticed.
- `trimline draft.txt | head` died with an EPIPE stack trace. A closed downstream pipe is normal
  usage; the CLI now exits quietly.

Tests: 44 → 50 (engine 25, UI 8, CLI 17).

## v0.2.2 — 2026-10-12 — the two limits my own README apologised for

- **Sentence boundaries became a scanner instead of a regex.** `Dr. Smith arrived at 3.5pm.` is one
  sentence; `e.g.`, `etc.` and initials like `J. K.` no longer split it. The long-sentence check and
  the reading-ease numbers both count sentences, so this made them honest too.
- **Passive voice ignores adjectival uses**: "I was tired" and "we were surprised" are states, not
  constructions hiding an actor. "The tool was built" is still reported.
- The first version of the initials check was wrong in a way worth keeping in the record: it tested
  a two-character slice against `^|[\s(]`, and `^` matches the start of *any* string — so every
  sentence ending in a capital letter ("We use the CLI.") looked like an initial and stopped
  splitting. The regression test is named after exactly that case.

Also in this version (no behaviour change, so the engine version stays 0.2.2)
- **The claims the posts make became tests** (`test/package.test.js`): no `fetch`/XHR/WebSocket/
  beacon/iframe anywhere in the shipped page, no remote URL in the app files, every local asset the
  page references actually exists, no absolute paths (so `file://` and subfolders both work), the
  engine stays free of node-only globals, and the version is declared in exactly one place that
  `package.json` must match. Verified non-vacuous by injecting a `fetch()` call: 2 tests fail, then
  pass again when reverted.
- `tools/build_site.py`: publishable bundle + `manifest.json` (sha256 per file). Refuses a bundle
  whose app files contain a remote URL — same rule, enforced at build time too.

Tests: 50 → 56 → 62 (engine 31, claims 6, UI 8, CLI 17).

## v0.3.0 — 2026-10-12 — tested on prose I did not write

Fetched three public-domain texts (Conan Doyle, Ibsen, Goncourt) and ran the engine over
13,049 sentences / 205,203 words. `tools/corpus_report.js` prints per-rule rates and samples;
the saved output is `corpus/REPORT-2026-10-12.md`.

Changed
- **Thresholds are rule-set data** (`longSentenceWords`, `bulletWall`), validated on load. The
  25-word limit was a social-post rule silently applied to everything: on real narrative prose it
  flags 18.3% of sentences; at 45 words it flags 3.4%. Same text, different surface.
- **Word boundaries no longer use `\b`.** `\b` treats `_` as a word character, so `_in order to_ ship`
  matched nothing at all — markdown emphasis hid phrases from both the flagger and the cutter.
  Boundaries are now "not a letter or digit", and emphasis markers are preserved in the output
  because they are the writer's formatting, not the tool's to delete.
- `rulesets/narrative.json`: prose calibration (limit 45, only ever-safe cuts, no chatty
  intensifier list).
- Corpus report is rule-set aware, so the same text can be measured under two calibrations.

Tests: 62 → 68 (engine 37, claims 6, UI 8, CLI 17). Two CLI assertions were updated because the
report now states the active limit; one of my own expectations assumed the cutter would capitalise
a mid-sentence replacement, which it correctly does not.

## v0.3.1 — 2026-10-12 — the cutter was rewriting prose it never cut

Ran the destructive path (`Apply safe cuts`) over the corpus and read the diffs.
**170 of 4,156 paragraphs (4.1%) were being modified.** They should not have been.

- Cause: a blanket "restore capitalisation after a deleted opener" pass that ran on the whole text,
  not just where a cut happened. On real prose it produced *"Oh! Don't say such horrid things"*,
  *"Good! This is quite touching"*, *"Mme. De Saint-Sauveur"*, *"'you villain! You thief!"* —
  four different ways of overwriting a writer's voice while claiming to only shorten sentences.
- Now a marker is laid down only where a cut lands at a sentence start, capitalisation follows the
  cut, and the markers are removed before returning. No cut, no change — the same guarantee the
  safe/risky split already promised.
- Result on the corpus: **36 of 4,156 paragraphs changed (0.9%)**, and every sampled diff is a
  genuine cut (`in order to` → `to`, `in spite of the fact that` → `although`).
- Also fixed: my sentence-start test had a malformed character class (`["'”’)]\s]*`, where the `]`
  closed the class early), so cuts at the start of a *second* sentence were left lowercase.
- Two existing tests turned out to encode the old bug (they expected trim to capitalise a sentence it
  made no change to). Updated, with the reason in a comment, rather than left as a trap.

Tests: 68 → 70. `tools/corpus_report.js --diffs N` is now the standing audit of this path.

## v0.3.2 — 2026-10-12 — two denominators instead of one ambiguous one

`analyze()` reported readability from the **trimmed** text, so a corpus metric built on it ("what
share of sentences is too long") moved whenever trim behaviour moved — which is exactly what happened
(13,049 then 12,937 for byte-identical files). Fixed by definition rather than by memory:

- `analyze()` now returns `sentencesBefore` (the writing) and `sentencesAfter` (the tool's output).
- Corpus ratios use `sentencesBefore`, so they are trim-independent: 12,937 under both rule sets.
- The CLI prints the sentence count and only mentions the after-count when the tool changed it —
  a cut that merges two sentences should be visible, not silent.
- The page's "sentences" stat is the original count.

Tests: 70 → 72.

## v0.3.3 — 2026-10-12 — closing marks and dashes in sentence boundaries

Third external surface (Darwin, the Upanishads, Leonardo's notebooks — 620,146 words total) found the
splitter failing on text like `Chapters_.—I have attempted…`: a period followed by an emphasis marker
and an em dash was not a boundary, so a chapter summary glued whole arguments together.

- Closing marks now recognised after a sentence-ending mark: quotes, brackets, and markdown emphasis
  (`_` and `*`), plus **at most one dash** (`-`, `—`, `–`), and a dash may be followed directly by a
  capital: `said—“Do not go.”` and `Chapters_.—I have…` both break correctly.
- Corpus effect: 28,088 → **29,307 sentences** found in the same files (1,219 real breaks that had
  been invisible).
- Checked rather than assumed: Darwin's longest sentence is still 208 words because it **is** one
  sentence — "I have attempted to show that…; that…; that…" with no period inside. The flag is true,
  not a splitter failure.

Tests: 72 → 75.

## v0.3.4 — 2026-10-12 — is "Apply safe cuts" a fixed point?

A destructive button should be safe to press twice. Property tested over the whole corpus
(9,546 paragraphs): **9,544 were already stable**, two were not — the leading-punctuation tidy removed
one stray mark per pass, so `".. outside the bowl…"` lost a second dot on the next press. One pass now
removes the whole run, and the corpus is a clean fixed point (0 unstable).

There is now a unit test asserting `trim(trim(x)) === trim(x)` for crafted cases, because "pressing it
again should do nothing" is the least a tool that edits your text can promise.

Tests: 75 → 76.

## v0.3.5 — 2026-10-12 — the first real-browser look

The page and the share card had never been seen in a browser: the card code had only ever run against a
stubbed canvas. Rendering it for real found two defects that no unit test had caught:

- **The card's overflow line printed on top of the footer.** Rows end at y=810 and the footer sits at
  y=850, but the "+N more patterns" line was hardcoded to y=850. It now follows the drawn rows, and the
  row cap drops to 3 when an overflow line is needed. There is now a layout test that reads the recorded
  `fillText` coordinates and fails if the overflow line reaches the footer.
- **A repeated rule reported its first finding, not its worst.** "long-sentence ×2 — 27 words (limit 25)"
  shown next to a 65-word sentence understated the one number a writer needs. Groups now keep the worst.

Also added: `#cardpreview` — open the page with that hash and the card is drawn into the document instead
of handed to the browser as a download, which is how the card got looked at. Verified in the browser:
live analysis, apply safe cuts (4 cuts, 10 → 5 findings), undo, custom rule set (`safe` applied, unsafe
flagged only), card layout.

### added after the first posts went out (same engine, new build target)

- **Single-file build**: `tools/build_single.js` emits one self-contained `trimline.html` (42,754 bytes)
  with the engine and UI inlined, and `build_site.py` now generates it as part of the bundle run so a
  stale copy cannot survive in a shipped folder. It is in `manifest.json` with a hash. Verified in a real
  browser: analysis, apply safe cuts (5 cuts, 9 → 3 findings), engine v0.3.5 in the footer.
- **A real corruption bug in that build, caught before it shipped**: inlining with
  `String.replace(tag, string)` expands `$&` / `` $` `` / `$'` inside the *inlined source* and silently
  injects page text into the output — `src/rules.js` contains one such token. The byte-identity test
  failed first, then a replacer function fixed it. Five new tests (84 total), including one asserting each
  inlined block is byte-identical to the file the other tests cover.

Tests: 76 → 79 → 84.

## Planned
- v0.3: CSV export of findings, and a `--strict` mode that treats flagged-only rules as failures.
- v0.3: "compare two drafts" mode with a real line-level diff in the page.
- v0.3: browser QA of the canvas share card, then either keep it or delete it in favour of
  `tools/make_card.py` (two renderers for one artifact is one too many).

