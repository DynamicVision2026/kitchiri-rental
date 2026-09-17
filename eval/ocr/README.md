# OCR accuracy gates — Batches 1 and 2

**Status: Batches 1 and 2 do not exist in this repository.** Checked the working
tree, the full commit history, and `origin/main` — nothing under `eval/ocr/`
existed before this ticket. The V16 ticket itself says "I have not seen these
files; confirm they are in the repo before starting" — this is that confirmation,
and the honest answer is no.

**No accuracy numbers are reported anywhere in this repo for V16.** `npm run
eval:ocr-accuracy` (this directory's `run.ts`) refuses to run and exits non-zero
rather than inventing pre-confirmation or post-confirmation percentages, a
disagreement rate, or a refusal rate against data that does not exist. Any number
that looked like Task 4's gate table without real photographs behind it would be
fabricated, and fabricating it would defeat the entire point of a ticket about not
trusting numbers that were never actually measured.

## What IS verified without Batches 1/2

- The dual-pass comparison logic itself (`lib/ingest/dual-pass.ts`) — 22
  assertions, `npm run eval:dual-pass`, including the exact failure the ticket
  names (「金120,000円」 read as 120,000 vs 20,000) and a check that a confidence
  gap never silently resolves a dispute.
- The full OCR route composition — engine → legibility refusal → dual-pass — using
  hand-built fixtures (`npm run eval:ocr-route`).
- Confirmed OCR output actually round-trips through the unchanged judgment engine
  (segment → classify → score) into correct findings (`npm run eval:assemble-text`).
- The region-linked confirmation screen end-to-end against a real (synthetically
  generated, not photographed) receipt image, screenshotted for visual QA — see
  the session history for V16 Task 3.

None of that substitutes for Task 4. All of it proves the pipeline is *correctly
built*; only real photographs with real ground truth can show whether it is
*accurate on real, dirty input* — handwritten notes, thermal receipts, stamp
overlays, the exact conditions this ticket is about.

## What this harness does once Batches 1/2 exist

Drop photographs and their ground truth into `batch-1/` and `batch-2/` matching
the layout below, then run `npm run eval:ocr-accuracy`. It will:

1. Run both OCR passes per image (real engine if `ANTHROPIC_API_KEY` is set, the
   mock double otherwise — the mock will refuse with a clear error unless fixtures
   matching every ground-truth image's byte length are also registered, so running
   this against the mock engine is only useful for exercising the harness's own
   plumbing, never for a real accuracy number).
2. Compute **pre-confirmation** accuracy: does each OCR line's normalised value
   exactly match the corresponding ground-truth field, per field class, before any
   human sees it?
3. Compute **post-confirmation** accuracy, the number that actually gates launch:
   for `amount`/`date` fields, a disputed or missing line is assumed corrected by
   a human against the source document (that is what the confirmation screen is
   *for* — this harness cannot simulate an actual person, so it models the
   intended outcome and says so in the report); the field that can still be wrong
   post-confirmation is one where **both passes agreed on the same incorrect
   value** — dual-pass verification cannot catch that case by construction, and
   this is the number that tells you how often it happens.
4. Report refusal rate, disagreement rate, and mean corrections per document,
   per batch, per the ticket's Task 4 table — never aggregated across field
   classes.

## Expected layout

```
eval/ocr/batch-1/
  001.jpg
  001.json
  002.jpg
  002.json
  ...
eval/ocr/batch-2/
  ...
```

Each `NNN.json` ground-truth file:

```json
{
  "fields": [
    { "field_class": "amount", "text": "35,000円" },
    { "field_class": "date", "text": "令和7年3月31日" },
    { "field_class": "label", "text": "ハウスクリーニング費用" },
    { "field_class": "name", "text": "山田太郎" }
  ]
}
```

`fields` should list every field a human transcriber can read on the document,
in reading order, one entry per instance (repeat `field_class` values are fine —
list each occurrence separately). `run.ts` matches OCR output to ground truth by
field class and reading order (top-to-bottom, then left-to-right, same ordering
`lib/ingest/dual-pass.ts` already sorts by) — this pairing has not been validated
against real photographs either; if a real batch's layout makes that pairing
ambiguous (e.g. a genuinely two-column form), that will need addressing when the
real data arrives, not assumed away here.
