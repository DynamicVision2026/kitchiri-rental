/**
 * Generates docs/citation-audit-checklist.md — the worklist a human needs in order
 * to close out primary-source verification on the taikyo golden set.
 *
 *   npm run audit:citations
 *
 * Entries whose source is one of our own fixtures are excluded: they assert no
 * judgment, so there is nothing to look up. Everything else is grouped by the
 * authority it cites, because a reviewer pulls one 判例集 volume and clears every
 * entry resting on it at once — the unit of work is the citation, not the entry.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { corpusSchema, type CorpusEntry } from "../lib/modules/taikyo/taxonomy.ts";

const corpusPath = fileURLToPath(new URL("../tests/golden-set/taikyo-corpus.json", import.meta.url));
const outPath = fileURLToPath(new URL("../docs/citation-audit-checklist.md", import.meta.url));

const corpus = corpusSchema.parse(JSON.parse(readFileSync(corpusPath, "utf8")));

/** Collapses citation spellings that name the same authority onto one key. */
function groupKey(reference: string): string {
  const date = reference.match(/(平成|令和)\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (date) {
    const court = /最高裁|最判/.test(reference)
      ? "最高裁"
      : /高等裁判所|高裁/.test(reference)
        ? "高裁"
        : /地方裁判所|地裁/.test(reference)
          ? reference.match(/(東京|大阪|京都|神戸|名古屋|横浜|福岡|札幌)/)?.[0] + "地裁"
          : "裁判例";
    return `${court} ${date[1]}${date[2]}年${date[3]}月${date[4]}日`;
  }
  if (/RETIO/i.test(reference)) return `RETIO ${reference.match(/RETIO\s*(\d+)号/i)?.[1] ?? "(号数不明)"}号`;
  if (/ガイドライン|国土交通省|国交省/.test(reference)) return "国土交通省 原状回復ガイドライン（再改訂版, 平成23年8月）";
  if (/標準契約書/.test(reference)) return "賃貸住宅標準契約書";
  if (/国民生活センター|PIO-NET/.test(reference)) return "国民生活センター / PIO-NET";
  const article = reference.match(/(民法|消費者契約法)\s*第?\s*(\d+)\s*条/);
  if (article) return `${article[1]}${article[2]}条`;
  return reference;
}

/** Where a reviewer should go to close the group out. */
function whereToLook(key: string): string {
  if (key.startsWith("最高裁")) return "民集 / 裁判所ウェブサイト 裁判例検索";
  if (key.includes("地裁") || key.includes("高裁") || key === "裁判例") return "判例時報・判例タイムズ、または RETIO 判例検索システム";
  if (key.startsWith("RETIO")) return "https://www.retio.or.jp — 該当号の PDF";
  if (key.startsWith("国土交通省")) return "国土交通省「原状回復をめぐるトラブルとガイドライン（再改訂版）」本文";
  if (key.startsWith("民法") || key.startsWith("消費者契約法")) return "e-Gov 法令検索（条文確認のみ）";
  if (key.includes("国民生活センター")) return "国民生活センター公表資料 / PIO-NET";
  return "要出典特定";
}

/** Known open questions that a reviewer must settle, keyed by group. */
const OPEN_QUESTIONS: Record<string, string[]> = {
  "最高裁 平成23年3月24日": [
    "Confirm the reported facts (rent ¥96,000, ¥210,000 retained ≈ 2.19x) and that the clause was upheld.",
    "Confirm this is the FRAMEWORK case and that the 2x–3.5x range belongs to 平成23年7月12日, not to this decision. `SHIKIBIKI_BAND.supportedMax = 2.0` rests on this.",
  ],
  "最高裁 平成23年7月15日": [
    "BLOCKING for `KOSHINRYO_BAND.elevatedMax = 2.7`. The judgment disposed of consolidated appeals and secondary summaries disagree: two months' rent per year on rent of ¥38,000 (2.0) under one reading, ¥100,000 (≈2.63) under another.",
    "Fix which facts the court actually upheld, then confirm or retune elevatedMax. TK-0012's band level and P3 both turn on this.",
  ],
  "最高裁 平成17年12月16日": [
    "Confirm the three-limb test as we state it in `PRONGS.P1`/`P4` and in the validator's article 621 check: (a) concrete scope and cost, (b) tenant recognised the burden, (c) tenant assented.",
    "This rule decides P4 for every depreciation-sensitive pattern, so an error here propagates widely.",
  ],
  "東京地裁 平成21年9月18日": [
    "Already cross-read: the case decided BOTH charges (rent ¥56,000/mo, cleaning ¥25,000+tax, key change ¥12,600) and upheld both. Confirm against ガイドライン事例36 itself.",
    "Confirm TK-0029 no longer cites this as authority for invalidity (it is now a constructed variant that contrasts with the holding).",
  ],
  "東京地裁 平成28年12月20日": [
    "Cited as RETIO 109号108頁. The issue and page were confirmed to exist; the HOLDING was NOT — the PDF was unreachable.",
    "Confirm whether the full-replacement clause was upheld and on what reasoning. TK-0037 was flipped to P4 false to keep the article 621 rule uniform, which now runs AGAINST the direction this citation was originally offered for. Either the citation or the entry is wrong.",
  ],
  "RETIO 51号": [
    "Holding NOT established — unreachable. Confirm the appellate outcome and that it supports TK-0055 scoring P4 true.",
    "TK-0055 is the sole entry in the corpus where a blanket clause is enforceable, so it anchors the positive side of the article 621 rule.",
  ],
  "東京地裁 令和2年2月6日": [
    "Confirm the case exists as cited and that a one-month penalty within a two-year lock-in was upheld.",
    "Confirm whether it addresses a notice period stacking on top of the penalty — that distinction is what separates TK-0056 from TK-0057, and it is not currently carried by any field the engine reads.",
  ],
};

type Group = { key: string; where: string; entries: CorpusEntry[]; spellings: Set<string> };

const groups = new Map<string, Group>();
let synthetic = 0;
for (const entry of corpus.cases) {
  if (entry.source.verification_status === "not_applicable_synthetic") {
    synthetic += 1;
    continue;
  }
  const key = groupKey(entry.source.reference);
  const g = groups.get(key) ?? { key, where: whereToLook(key), entries: [], spellings: new Set<string>() };
  g.entries.push(entry);
  g.spellings.add(entry.source.reference);
  groups.set(key, g);
}

const ordered = [...groups.values()].sort((a, b) => b.entries.length - a.entries.length || a.key.localeCompare(b.key));
const outstanding = ordered.reduce((n, g) => n + g.entries.length, 0);

const L: string[] = [];
L.push("# Citation audit checklist — taikyo golden set");
L.push("");
L.push(`_Generated by \`npm run audit:citations\` from \`tests/golden-set/taikyo-corpus.json\` v${corpus.version}. Do not edit by hand._`);
L.push("");
L.push("## Why this exists");
L.push("");
L.push(
  "`source.verified` is true only where a human has confirmed a citation against the primary text, and the " +
    "validator enforces that it implies `verification_status == \"primary_source_verified\"`. That count is currently " +
    "**zero**: the build environment cannot reach 裁判所, 国土交通省 or RETIO, so citations were cross-read against " +
    "secondary summaries at best. That cross-reading already caught two real errors, which is the argument for " +
    "doing this properly rather than flipping the flag.",
);
L.push("");
L.push("**Nothing derived from this corpus should reach a user until the groups below are cleared.**");
L.push("");
L.push("## Scoreboard");
L.push("");
L.push("| | Count |");
L.push("| --- | ---: |");
L.push(`| Entries in corpus | ${corpus.cases.length} |`);
L.push(`| Our own fixtures — nothing to verify | ${synthetic} |`);
L.push(`| **Entries asserting an external source** | **${outstanding}** |`);
L.push(`| Distinct authorities to pull | ${ordered.length} |`);
L.push(`| Already primary-source verified | ${corpus.cases.filter((c) => c.source.verified).length} |`);
L.push("");
L.push("## How to clear a group");
L.push("");
L.push(
  "1. Pull the primary text named under **Where**.\n" +
    "2. Answer every question under **Confirm**.\n" +
    "3. If the authority does not say what we claim, fix the entry — do not weaken the claim to fit.\n" +
    "4. Set `verification_status: \"primary_source_verified\"` and `verified: true` on each entry listed.\n" +
    "5. Re-run `npm run validate:corpus` (it rejects `verified: true` without the status) and `npm run audit:citations`.",
);
L.push("");
L.push("---");
L.push("");

for (const g of ordered) {
  L.push(`## ${g.key}`);
  L.push("");
  L.push(`**Where:** ${g.where}`);
  if (g.spellings.size > 1) {
    L.push("");
    L.push(`**Cited in the corpus as:** ${[...g.spellings].map((s) => `\`${s}\``).join(" · ")}`);
  }
  L.push("");
  const questions = OPEN_QUESTIONS[g.key];
  if (questions) {
    L.push("**Confirm:**");
    L.push("");
    for (const q of questions) L.push(`- [ ] ${q}`);
    L.push("");
  } else {
    L.push("**Confirm:**");
    L.push("");
    L.push("- [ ] The authority exists as cited and says what the entries below rely on.");
    L.push("");
  }
  L.push(`**Entries resting on it (${g.entries.length}):**`);
  L.push("");
  L.push("| | Entry | Pattern | Verdict | Status | Clause (opening) |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  for (const e of g.entries.sort((a, b) => a.id.localeCompare(b.id))) {
    const head = e.clause_text.slice(0, 34).replace(/\|/g, "\\|");
    L.push(
      `| [ ] | \`${e.id}\` | ${e.expected_code} | ${e.expected_verdict} | ${e.source.verification_status} | ${head}… |`,
    );
  }
  L.push("");
}

L.push("---");
L.push("");
L.push("## Notes carried on individual entries");
L.push("");
L.push("Entries whose `source.note` records a correction or an open question:");
L.push("");
for (const e of corpus.cases) {
  const note = e.source.note;
  if (!note) continue;
  if (!/CITATION CORRECTED|CITATION CONFIRMED|CONTESTED FIGURE/.test(note)) continue;
  L.push(`- **\`${e.id}\`** — ${note.split(". ").slice(0, 2).join(". ")}.`);
}
L.push("");

writeFileSync(outPath, L.join("\n"));
console.log(`wrote ${outPath}`);
console.log(`  ${outstanding} entries asserting an external source, across ${ordered.length} authorities`);
console.log(`  ${synthetic} of our own fixtures excluded`);
