/**
 * Segmentation check.  npm run eval:segment
 *
 * Splitting is the step everything downstream trusts: a clause torn in half evaluates
 * as two wrong answers rather than one right one, and silently. This asserts the
 * structure of a realistic lease rather than eyeballing it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { segmentContract, segmentLabel } from "../../lib/modules/taikyo/segment.ts";

const source = readFileSync(fileURLToPath(new URL("./sample-lease.txt", import.meta.url)), "utf8");
const segments = segmentContract(source);
const failures: string[] = [];

console.log(`segmented into ${segments.length} clauses\n`);
for (const s of segments) {
  const flag = s.isTokuyakuSection ? "特約" : "本文";
  console.log(`  [${String(s.index).padStart(2)}] ${flag} ${segmentLabel(s).padEnd(22)} ${s.text.replace(/\n/g, " ").slice(0, 44)}`);
}

const expect = (cond: boolean, msg: string) => { if (!cond) failures.push(msg); };

expect(segments.length >= 18, `expected at least 18 segments, got ${segments.length}`);
expect(segments.some((s) => s.articleLabel === "第9条" && s.articleTitle === "原状回復"),
  "第9条（原状回復） was not detected with its title");
expect(segments.filter((s) => s.articleLabel === "第9条").length === 2,
  "第9条 should split into its two 項");
expect(segments.filter((s) => s.isTokuyakuSection).length === 6,
  `特約事項 should yield 6 clauses, got ${segments.filter((s) => s.isTokuyakuSection).length}`);
expect(segments.every((s) => source.slice(s.start, s.end).includes(s.text.split("\n")[0])),
  "offsets must point at the original text");
expect(!segments.some((s) => s.text.includes("第10条") && s.articleLabel !== "第10条"),
  "an article header leaked into another segment's body");
expect(segments.some((s) => s.text.includes("ハウスクリーニング費用として、賃借人は金120,000円")),
  "the cleaning 特約 was torn apart");

// A cross-reference must not start a new article.
const crossRef = segmentContract("第1条（目的）\n　本契約は第2条に定める期間について適用されるものとする。");
expect(crossRef.length === 1, `an inline 第2条 reference split the clause: got ${crossRef.length} segments`);

// A bare clause with no structure must still come back.
const bare = segmentContract("賃借人は、退去時のハウスクリーニング費用として金30,000円を負担するものとする。");
expect(bare.length === 1, "a single unstructured clause should return one segment");

if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK");
