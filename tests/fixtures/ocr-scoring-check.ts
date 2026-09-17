/**
 * Unit check for eval/ocr/scoring.ts — the matching and accuracy arithmetic the
 * accuracy-gate harness depends on, tested against hand-built fixtures since no
 * real ground-truth batch exists (see eval/ocr/README.md).
 *
 *   npm run eval:ocr-scoring
 */

import { accuracyByFieldClass, gateResult, matchToGroundTruth, type GroundTruthSample } from "../../eval/ocr/scoring.ts";
import type { VerifiedLine } from "../../lib/ingest/dual-pass.ts";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    console.error(`  FAIL ${name}`);
    failures += 1;
  }
}

function verified(over: Partial<VerifiedLine>): VerifiedLine {
  return {
    field_class: "other", page: 1, bbox: { x: 0, y: 0, w: 0.2, h: 0.03 },
    status: "confirmed_auto", pass_a: null, pass_b: null, resolved_text: null,
    user_corrected: false, ...over,
  };
}
function line(text: string, confidence = 0.9): VerifiedLine["pass_a"] {
  return { text, bbox: { x: 0, y: 0, w: 0.2, h: 0.03 }, page: 1, field_class: "amount", confidence };
}

const sample: GroundTruthSample = {
  id: "test-001",
  fields: [
    { field_class: "amount", text: "35,000円" }, // correctly read, confirmed_auto
    { field_class: "amount", text: "120,000円" }, // both passes agree on a WRONG value — the one gap dual-pass can't catch
    { field_class: "date", text: "令和7年3月31日" }, // disputed, human fixes it correctly (modelled)
    { field_class: "name", text: "山田太郎" }, // engine found nothing at all
  ],
};

const lines: VerifiedLine[] = [
  verified({ field_class: "amount", status: "confirmed_auto", resolved_text: "35,000円", pass_a: line("35,000円") }),
  verified({ field_class: "amount", status: "confirmed_auto", resolved_text: "20,000円", pass_a: line("20,000円") }), // both passes wrongly agreed
  verified({ field_class: "date", status: "disputed", resolved_text: null, pass_a: line("令和7年3月30日"), pass_b: line("令和7年3月31日") }),
  // no "name" line at all — engine missed it
];

const matches = matchToGroundTruth(lines, sample);
check("4 ground-truth fields produce 4 matches", matches.length === 4);

const amount1 = matches[0];
check("correctly-read amount matches pre and post", amount1.preConfirmation === "35,000円" && amount1.postConfirmation === "35,000円");

const amount2 = matches[1];
check("a both-passes-wrong amount is NOT caught pre-confirmation", amount2.preConfirmation === "20,000円");
check("the same both-passes-wrong amount survives POST-confirmation too — this is the real gap", amount2.postConfirmation === "20,000円");

const date1 = matches[2];
check("a disputed date has no single pre-confirmation reading to grade (pass A's, here wrong)", date1.preConfirmation === "令和7年3月30日");
check("a disputed date is modelled as human-corrected post-confirmation", date1.postConfirmation === "令和7年3月31日");

const name1 = matches[3];
check("a field the engine never found has no pre or post reading", name1.preConfirmation === null && name1.postConfirmation === null);

const acc = accuracyByFieldClass(matches);
const amountAcc = acc.find((a) => a.field_class === "amount")!;
check("amount pre-confirmation accuracy is 1/2 (the silent agreement is a miss)", amountAcc.preConfirmationRate === 0.5);
check("amount post-confirmation accuracy is ALSO 1/2 — confirmation does not fix a silent dual-pass agreement", amountAcc.postConfirmationRate === 0.5);
check("amount fails its 99% gate at 50%", gateResult(amountAcc) === "fail");

const dateAcc = acc.find((a) => a.field_class === "date")!;
check("date pre-confirmation accuracy is 0/1 (pass A was wrong)", dateAcc.preConfirmationRate === 0);
check("date post-confirmation accuracy is 1/1 — the dispute mechanism did its job", dateAcc.postConfirmationRate === 1);
check("date passes its 98% gate post-confirmation", gateResult(dateAcc) === "pass");

const nameAcc = acc.find((a) => a.field_class === "name")!;
check("a field the engine never found scores 0 pre and post", nameAcc.preConfirmationRate === 0 && nameAcc.postConfirmationRate === 0);
check("name fails its 90% gate", gateResult(nameAcc) === "fail");

console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
