/**
 * PDF ingestion check.  npm run eval:ingest
 *
 * Builds a real PDF from the sample lease, extracts it, and asserts the extracted
 * text still segments into the same clause structure — extraction is only useful if
 * what comes out the other end is still a contract. Then checks every refusal path,
 * because the refusals are the safety property: a scanned PDF must NOT arrive at the
 * analyser as a handful of nonsense clauses.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractContractText, MIN_CHARS_PER_PAGE } from "../../lib/modules/taikyo/ingest.ts";
import { segmentContract } from "../../lib/modules/taikyo/segment.ts";
import { evaluateContract } from "../../lib/modules/taikyo/batch.ts";

const failures: string[] = [];
const expect = (c: boolean, m: string) => { if (!c) failures.push(m); };

const lease = readFileSync(fileURLToPath(new URL("./sample-lease.txt", import.meta.url)), "utf8");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

await page.setContent(
  `<meta charset="utf-8"><style>body{font-family:"Noto Sans CJK JP",sans-serif;font-size:11pt;line-height:1.9;white-space:pre-wrap;padding:24px}</style><body>${esc(lease)}`,
);
const textPdf = await page.pdf({ format: "A4" });

// A scan stand-in: a page with no text layer at all.
await page.setContent('<body style="margin:0"><div style="width:100%;height:1000px;background:#eee"></div></body>');
const scanPdf = await page.pdf({ format: "A4" });
await browser.close();

// 1. Text-layer PDF extracts and still looks like the contract.
const good = await extractContractText(new Uint8Array(textPdf));
expect(good.ok, "a text-layer PDF must extract");
if (good.ok) {
  console.log(`extracted ${good.text.length} chars over ${good.pages} pages (${good.charsPerPage}/page)`);
  const segments = segmentContract(good.text);
  console.log(`segmented into ${segments.length} clauses`);
  expect(segments.length >= 18, `extracted text should segment like the original, got ${segments.length}`);
  expect(segments.filter((s) => s.isTokuyakuSection).length === 6, "特約事項 block lost in extraction");
  expect(good.text.includes("経過年数や耐用年数にかかわらず"), "a key clause did not survive extraction");

  const report = await evaluateContract(good.text);
  console.log(`report: risk=${report.riskLevel} evaluated=${report.clausesEvaluated} unenforceable=${report.verdictCounts.unenforceable}`);
  expect(report.riskLevel === "high", `PDF path should reach the same risk level as the text path, got ${report.riskLevel}`);
  expect(report.verdictCounts.unenforceable >= 3, "PDF path lost findings the text path finds");
}

// 2. A scanned page must be refused, not silently analysed.
const scan = await extractContractText(new Uint8Array(scanPdf));
expect(!scan.ok, "a PDF with no text layer must be refused");
if (!scan.ok) {
  console.log(`scan refused: ${scan.failure} (${scan.charsPerPage ?? 0} chars/page, floor ${MIN_CHARS_PER_PAGE})`);
  expect(scan.failure === "no_text_layer", `expected no_text_layer, got ${scan.failure}`);
  expect(scan.messageJa.includes("貼り付け"), "the refusal must tell the user what to do instead");
  expect(/OCR/.test(scan.messageJa), "the refusal must explain why OCR is not used");
}

// 3. Other refusal paths.
const empty = await extractContractText(new Uint8Array(0));
expect(!empty.ok && empty.failure === "empty_file", "empty upload must be refused");
const notPdf = await extractContractText(new TextEncoder().encode("これはPDFではありません".repeat(20)));
expect(!notPdf.ok && notPdf.failure === "not_a_pdf", "a non-PDF must be refused before parsing");

if (failures.length) {
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK");
