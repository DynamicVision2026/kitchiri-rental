/**
 * Shared citation grouping, used by both the checklist generator and the verify CLI.
 *
 * The unit of audit work is the AUTHORITY, not the entry: a reviewer pulls one 民集
 * volume and clears every entry resting on it at once. Both tools must agree on what
 * a group is, or the CLI would clear something the report still shows as open — which
 * is why this lives in one place rather than being copied.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { corpusSchema, type Corpus, type CorpusEntry } from "../../lib/modules/taikyo/taxonomy.ts";

export const CORPUS_PATH = fileURLToPath(new URL("../../tests/golden-set/taikyo-corpus.json", import.meta.url));

export function readCorpus(): Corpus {
  return corpusSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, "utf8")));
}

/** Collapses citation spellings that name the same authority onto one key. */
export function groupKey(reference: string): string {
  const date = reference.match(/(平成|令和)\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (date) {
    const court = /最高裁|最判/.test(reference)
      ? "最高裁"
      : /高等裁判所|高裁/.test(reference)
        ? "高裁"
        : /地方裁判所|地裁/.test(reference)
          ? `${reference.match(/(東京|大阪|京都|神戸|名古屋|横浜|福岡|札幌)/)?.[0] ?? ""}地裁`
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

export function whereToLook(key: string): string {
  if (key.startsWith("最高裁")) return "民集 / 裁判所ウェブサイト 裁判例検索";
  if (key.includes("地裁") || key.includes("高裁") || key === "裁判例") return "判例時報・判例タイムズ、または RETIO 判例検索システム";
  if (key.startsWith("RETIO")) return "https://www.retio.or.jp — 該当号の PDF";
  if (key.startsWith("国土交通省")) return "国土交通省「原状回復をめぐるトラブルとガイドライン（再改訂版）」本文";
  if (key.startsWith("民法") || key.startsWith("消費者契約法")) return "e-Gov 法令検索（条文確認のみ）";
  if (key.includes("国民生活センター")) return "国民生活センター公表資料 / PIO-NET";
  return "要出典特定";
}

/** Open questions a reviewer must settle before a group can be signed off. */
export const OPEN_QUESTIONS: Record<string, string[]> = {
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

export interface CitationGroup {
  key: string;
  where: string;
  entries: CorpusEntry[];
  spellings: Set<string>;
  verified: number;
  /** Entries whose citation has at least been cross-read against secondary sources. */
  secondary: number;
}

/** Groups every entry that asserts an external source. Our own fixtures are excluded. */
export function groupCorpus(corpus: Corpus): { groups: CitationGroup[]; syntheticCount: number } {
  const groups = new Map<string, CitationGroup>();
  let syntheticCount = 0;

  for (const entry of corpus.cases) {
    if (entry.source.verification_status === "not_applicable_synthetic") {
      syntheticCount += 1;
      continue;
    }
    const key = groupKey(entry.source.reference);
    const g = groups.get(key) ?? {
      key, where: whereToLook(key), entries: [], spellings: new Set<string>(), verified: 0, secondary: 0,
    };
    g.entries.push(entry);
    g.spellings.add(entry.source.reference);
    if (entry.source.verification_status === "primary_source_verified") g.verified += 1;
    if (entry.source.verification_status === "secondary_source_checked") g.secondary += 1;
    groups.set(key, g);
  }

  const ordered = [...groups.values()].sort(
    (a, b) => b.entries.length - a.entries.length || a.key.localeCompare(b.key),
  );
  return { groups: ordered, syntheticCount };
}
