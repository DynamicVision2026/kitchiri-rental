/**
 * Checks that assembleConfirmedText() output actually round-trips through the real
 * engine (segmentContract + evaluateContract, unchanged) into sensible per-row
 * findings — not just that it produces some string. Uses hand-built VerifiedLine
 * fixtures shaped like a photographed settlement table; see assemble-text.ts's
 * file-level comment for what remains unvalidated against a REAL photo.
 *
 *   npm run eval:assemble-text
 */

import { assembleConfirmedText } from "../../lib/ingest/assemble-text.ts";
import type { VerifiedLine } from "../../lib/ingest/dual-pass.ts";
import { evaluateContract } from "../../lib/modules/taikyo/batch.ts";

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

// A 3-row settlement table, each row a (label, amount) pair on roughly the same y.
const lines: VerifiedLine[] = [
  verified({ field_class: "label", bbox: { x: 0.1, y: 0.10, w: 0.35, h: 0.03 }, resolved_text: "ハウスクリーニング費用として、賃借人は金" }),
  verified({ field_class: "amount", bbox: { x: 0.5, y: 0.101, w: 0.2, h: 0.03 }, resolved_text: "35,000円を負担するものとする。" }),
  verified({ field_class: "label", bbox: { x: 0.1, y: 0.30, w: 0.35, h: 0.03 }, resolved_text: "畳表替え費用として、賃借人は金" }),
  verified({ field_class: "amount", bbox: { x: 0.5, y: 0.302, w: 0.2, h: 0.03 }, resolved_text: "5,000円を負担するものとする。" }),
  verified({ field_class: "label", bbox: { x: 0.1, y: 0.50, w: 0.35, h: 0.03 }, resolved_text: "鍵交換費用として、賃借人は金" }),
  verified({ field_class: "amount", bbox: { x: 0.5, y: 0.501, w: 0.2, h: 0.03 }, resolved_text: "18,000円を負担するものとする。" }),
];

const text = assembleConfirmedText(lines, lines.map((l) => l.resolved_text));
console.log("--- assembled text ---");
console.log(text);
console.log("--- end ---\n");

check("assembled text carries a 特約事項 heading segment.ts recognises", text.startsWith("特約事項"));
check("assembled text has 3 numbered rows", (text.match(/^\d+\. /gm) ?? []).length === 3);
check("same-row label+amount landed on one line, not split", text.includes("35,000円を負担するものとする。") && !text.split("\n").some((l) => l === "35,000円を負担するものとする。"));

async function main() {
  const report = await evaluateContract(text, { placement: "lease_body" });
  check("segmentContract found 3 evaluable clauses (one per row)", report.clausesEvaluated === 3);
  const codes = report.findings.map((f) => f.evaluation.code).sort();
  check("all 3 rows classified (no UNKNOWN pattern)", codes.every((c) => c !== null));
  check("classified as the expected patterns (cleaning / tatami / key)", (() => {
    const set = new Set(codes);
    return set.has("TK_CLEAN") && set.has("TK_TATAMI") && set.has("TK_KAGI");
  })());
  const cleaning = report.findings.find((f) => f.evaluation.code === "TK_CLEAN");
  check("the cleaning row's amount was recovered from the assembled text (35,000)", cleaning?.amounts.headlineJpy === 35000);

  console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
