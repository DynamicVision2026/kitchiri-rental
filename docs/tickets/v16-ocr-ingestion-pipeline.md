Ticket V16 — OCR Ingestion Pipeline

**Repo:** `kitchiri-rental`
**Runs in parallel with V15.** Nothing here blocks Shopify wiring, the PDF handler, the workspace port, `/kijun` or the legal pages.
**Task 6 is immediate and independent** — do it first, it takes an afternoon.

---

## 0. The decision, made

**Engine: a cloud multimodal model, used for transcription only.**

Rationale: the test data is handwritten ledger notes, thermal receipts, stamp overlays and photographed paper. On-device and self-hosted Japanese OCR is materially worse on exactly those conditions, and accuracy on dirty data is the product. The privacy cost is a disclosure obligation, not an architectural one (see Task 5).

**The boundary does not move.** The model converts pixels to text and nothing else. It may not classify a clause, evaluate a prong, emit a verdict, or select a citation. Judgment stays deterministic — regex, weighted lexicon, precedence ladder — because that is what a 弁護士 can sign off on prong by prong and what produced 0 false-valid / 0 false-adverse across 80 cases. OCR sits strictly upstream of `extracted_confirmed`, and `runJudge` still refuses to run on unconfirmed extraction.

---

## 1. What "accuracy" means here, and where it comes from

No OCR will be perfect on a photographed handwritten 清算書 with a 受付済 stamp across the figures. Any spec promising otherwise is lying, and building as if it were true is how a wrong number reaches a tenant.

**The product's accuracy guarantee does not come from the OCR being right. It comes from wrongness being visible.** Three mechanisms, and they are the substance of this ticket:

1. **Dual-pass disagreement on figures** catches silent misreads.
2. **Region-linked confirmation** puts the tenant — who is holding the paper — in the verification loop.
3. **A hard refusal floor** makes unreadable input fail loudly instead of producing a partial table.

Build these first. The extraction call itself is the easy part.

---

## 2. Task 1 — Extraction interface

One module, one contract, swappable engine.

```ts
// lib/ingest/ocr.ts
export interface OcrEngine {
  id: string;                    // stamped onto the audit for reproducibility
  transcribe(image: ImageInput, pass: 'a' | 'b'): Promise<OcrResult>;
}

export interface OcrResult {
  lines: OcrLine[];
  raw_text: string;
}

export interface OcrLine {
  text: string;
  bbox: { x: number; y: number; w: number; h: number };  // normalised 0–1
  page: number;
  field_class: 'amount' | 'date' | 'name' | 'label' | 'other';
  confidence: number;
}
```

`bbox` is mandatory, not optional. Without it Task 3 is impossible, and Task 3 is the safety mechanism.

Engine id and both pass results are stored on the audit. When a tenant disputes what we told them, the transcription must be reconstructible.

---

## 3. Task 2 — Dual-pass numeral verification

Two transcription passes per image, different prompt framings or different engine settings.

Compare **character by character within `amount` and `date` fields only.** Prose disagreement is noise; figure disagreement is the failure that matters. 「金120,000円」 read once as 120,000 and once as 20,000 is the error that ends with a wrong letter in a landlord's hands.

```
agree on figure        → accept, mark confirmed_auto
disagree on figure     → mark disputed, force user correction before proceeding
either pass missing    → mark missing, force user entry
```

A disputed figure **blocks analysis** until the user resolves it. No defaulting to the higher-confidence pass.

Report the disagreement rate across Batches 1 and 2. Nobody currently knows it, and it is the single best measure of whether this pipeline is safe on real input.

---

## 4. Task 3 — Region-linked confirmation

The confirm screen already exists as the liability firewall. Extend it: each extracted line displays beside a crop of the image region it came from, taken from `bbox`.

- Disputed figures appear first, visually distinct, with an input focused and ready.
- Every `amount` field is editable, always, regardless of confidence.
- Nothing collapses into an accordion. Collapsed content does not get checked.
- The tenant is holding the paper. Design for the literal act of comparing crop to paper to field.

This is the highest-value screen in the OCR path and the reason the pipeline can be trusted at all.

---

## 5. Task 4 — Accuracy gates, measured on Batches 1 and 2

**Report per field class, never aggregate.** An overall 96% that conceals amount errors is worse than 88% that doesn't.

| Field class | Gate | Consequence of miss |
|---|---|---|
| `amount` | ≥99% exact, after dual-pass and user confirmation | Wrong money in a letter |
| `date` | ≥98% exact | Wrong depreciation years, wrong verdict |
| `name` | ≥90% | Cosmetic in the letter header |
| `label` | ≥85% | Feeds the label dictionary; `UNKNOWN_ITEM` catches misses |

Measure and report **pre-confirmation and post-confirmation separately.** Pre tells us how good the engine is; post tells us whether the safety net works. Post is the number that gates launch.

Also report, per batch: refusal rate, disagreement rate, and mean user corrections per document. If a tenant has to fix nine fields, the pipeline has failed even at high accuracy — that is friction the paste path doesn't have.

**Batches 1 and 2 must be committed to `eval/ocr/` with ground-truth JSON per sample.** I have not seen these files; confirm they are in the repo before starting, and if ground truth is missing for any sample, say so rather than eyeballing it.

---

## 6. Task 5 — Refusal floor and privacy

Keep the existing scan refusal as the fallback: below a legibility threshold, refuse and route to paste. Extend the message to name what went wrong — too dark, too blurry, cropped — and what to do.

**Privacy policy amendment, required before launch:** lease and settlement images contain names, addresses and property identifiers. The policy must name the processor, the processing region, that images are used solely for transcription, and the 90-day deletion. If the processor is outside Japan, the cross-border handling needs stating explicitly. Flag this to the owner as a 特商法/privacy copy item — it needs the same proofreading pass as everything else.

Images are deleted on the same 90-day schedule as the audit row, and immediately on user request.

---

## 7. Task 6 — Batch 3 and 4 into `eval:corpus` (do this first)

Independent of everything above, and small.

Slot both vectors in with **prong-level expectations, not just net balances.** A vector asserting only the final figure passes for the wrong reason and hides a broken prong.

For `TAIKYO-MOCK-001` (7-year tenancy, ¥35,000 fixed cleaning fee), the expected record must state which prongs the 特約 passes:

```
P1 specificity      → expected true  (scope and amount both stated)
P2 in signed doc    → expected true
P3 proportionality  → expected true  (¥35,000 within 1R–1LDK band ¥25,000–45,000)
P4 overrides 621    → expected ?     (must be asserted explicitly)
→ cleaning fee retained
→ wallpaper excluded: 7 years exceeds 6-year useful life, residual ≈ ¥1
```

Batch 4's ¥95,000 fee is the **same clause type at a different amount** — it should fail P3 and only P3. If Batch 3 teaches the engine "retain fixed cleaning fees" rather than "test the prongs," Batch 4's failure becomes accidental and the engine is wrong for a reason no test will reveal.

**Recompute the ¥121,500 refund independently before committing it.** A fixture carrying an arithmetic error becomes a permanent wrong answer with a green checkmark. The V14 pass already caught one inflated headline that came from exactly this.

`DUPLICATE_CLEANING_SCOPE` is not in scope here. Cross-checking line items against each other for overlap is a new engine capability, not a test of an existing one. It's worth building and it needs its own ticket.

---

## 8. Definition of done

A tenant photographs a paper 清算書 on a phone. Unreadable photos are refused with a clear reason. Readable ones produce a transcription where every figure either agreed across two passes or was corrected by the tenant against a crop of their own document. That confirmed text — and only that — reaches the deterministic engine.

Post-confirmation amount accuracy on Batches 1 and 2 is reported, per field class, with the refusal and correction rates alongside it.
