/**
 * 契約書全文 → 条項単位への分割.
 *
 * A Japanese lease is organised as 第N条 articles, each holding numbered 項 or
 * enumerated 号, plus a 特約事項 block at the end where the clauses we care about
 * usually live. This splits that structure into individually evaluable units.
 *
 * Design notes that matter for correctness:
 *   - Article and item markers are matched at LINE START only. 「第1条に定める」 inside
 *     a sentence is a cross-reference, not a new article, and splitting on it would
 *     tear a clause in half.
 *   - Numerals are matched in half-width, full-width and kanji forms, because real
 *     contracts mix all three, often within one document.
 *   - Text is never rewritten. Offsets point into the ORIGINAL string so the UI can
 *     highlight the source, and normalisation happens only on a scratch copy.
 *   - A segment shorter than MIN_CLAUSE_CHARS is treated as a heading or stray line
 *     and folded into its parent rather than evaluated as a clause of its own.
 */

export interface ContractSegment {
  /** Position in the document, 0-based. */
  index: number;
  /** e.g. "第10条" — null for text before any article, such as a 特約事項 preamble. */
  articleLabel: string | null;
  /** Parenthesised article title, e.g. "原状回復". */
  articleTitle: string | null;
  /** e.g. "1", "（2）", "二" — null when the article has no enumerated items. */
  itemLabel: string | null;
  /** True when the segment sits under a 特約事項 / 特記事項 heading. */
  isTokuyakuSection: boolean;
  /** Clause text, trimmed, exactly as it appears in the source. */
  text: string;
  /** Offsets into the original document string. */
  start: number;
  end: number;
}

/** Below this, a line is a heading or a fragment rather than an evaluable clause. */
export const MIN_CLAUSE_CHARS = 12;

const ARTICLE_RE = /^[ \t　]*(第\s*[0-9０-９一二三四五六七八九十百]+\s*条(?:の\s*[0-9０-９一二三四五六七八九十]+)?)\s*[．.:：]?\s*(?:[（(]([^）)]{0,40})[）)])?/;
const ITEM_RE = /^[ \t　]*((?:[0-9０-９]{1,2}[．.、)）]|[（(][0-9０-９一二三四五六七八九十]{1,3}[）)]|[一二三四五六七八九十]{1,3}[、．]|[・･])）?)\s*/;
const TOKUYAKU_HEADING_RE = /^[ \t　]*[【\[]?\s*(特約事項|特記事項|特約|その他の特約)\s*[】\]]?\s*[:：]?\s*$/;

/** Kanji digits and full-width forms appear interchangeably; compare on a normalised copy. */
function normalise(line: string): string {
  return line.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

interface Pending {
  articleLabel: string | null;
  articleTitle: string | null;
  itemLabel: string | null;
  isTokuyakuSection: boolean;
  lines: string[];
  start: number;
  end: number;
}

/**
 * Splits a whole contract into clause-sized segments.
 *
 * Returns an empty array for text with no recognisable structure ONLY when the text
 * is too short to be a clause; otherwise the entire input comes back as one segment,
 * so a user who pastes a single clause still gets an answer rather than silence.
 */
export function segmentContract(source: string): ContractSegment[] {
  const segments: ContractSegment[] = [];
  let pending: Pending | null = null;
  let inTokuyaku = false;

  const flush = () => {
    if (!pending) return;
    const text = pending.lines.join("\n").trim();
    if (text.length >= MIN_CLAUSE_CHARS) {
      segments.push({
        index: segments.length,
        articleLabel: pending.articleLabel,
        articleTitle: pending.articleTitle,
        itemLabel: pending.itemLabel,
        isTokuyakuSection: pending.isTokuyakuSection,
        text,
        start: pending.start,
        end: pending.end,
      });
    } else if (text.length > 0 && segments.length > 0) {
      // Too short to stand alone — a heading or a stray fragment. Fold it into the
      // previous segment rather than dropping text the user can see on screen.
      const prev = segments[segments.length - 1];
      prev.text = `${prev.text}\n${text}`.trim();
      prev.end = pending.end;
    }
    pending = null;
  };

  let offset = 0;
  let currentArticle: string | null = null;
  let currentTitle: string | null = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;
    offset = lineEnd + 1; // +1 for the newline we split on

    const line = rawLine.trim();
    if (line.length === 0) continue;

    const probe = normalise(line);

    if (TOKUYAKU_HEADING_RE.test(probe)) {
      flush();
      inTokuyaku = true;
      currentArticle = null;
      currentTitle = null;
      continue;
    }

    const article = probe.match(ARTICLE_RE);
    if (article) {
      flush();
      currentArticle = article[1].replace(/\s+/g, "");
      currentTitle = article[2]?.trim() ?? null;
      const body = line.slice(article[0].length).trim();
      pending = {
        articleLabel: currentArticle,
        articleTitle: currentTitle,
        itemLabel: null,
        isTokuyakuSection: inTokuyaku,
        lines: body ? [body] : [],
        start: lineStart,
        end: lineEnd,
      };
      continue;
    }

    const item = probe.match(ITEM_RE);
    if (item && line.length > item[0].length + 4) {
      flush();
      pending = {
        articleLabel: currentArticle,
        articleTitle: currentTitle,
        itemLabel: item[1].replace(/\s+/g, ""),
        isTokuyakuSection: inTokuyaku,
        lines: [line.slice(item[0].length).trim()],
        start: lineStart,
        end: lineEnd,
      };
      continue;
    }

    if (pending) {
      pending.lines.push(line);
      pending.end = lineEnd;
    } else {
      pending = {
        articleLabel: currentArticle,
        articleTitle: currentTitle,
        itemLabel: null,
        isTokuyakuSection: inTokuyaku,
        lines: [line],
        start: lineStart,
        end: lineEnd,
      };
    }
  }
  flush();

  if (segments.length === 0) {
    const whole = source.trim();
    if (whole.length >= MIN_CLAUSE_CHARS) {
      return [{
        index: 0, articleLabel: null, articleTitle: null, itemLabel: null,
        isTokuyakuSection: false, text: whole,
        start: source.indexOf(whole), end: source.indexOf(whole) + whole.length,
      }];
    }
  }
  return segments;
}

/** Human-readable location, e.g. "第10条（原状回復） 2" — for the UI and the report. */
export function segmentLabel(segment: ContractSegment): string {
  const parts: string[] = [];
  if (segment.articleLabel) {
    parts.push(segment.articleTitle ? `${segment.articleLabel}（${segment.articleTitle}）` : segment.articleLabel);
  } else if (segment.isTokuyakuSection) {
    parts.push("特約事項");
  }
  if (segment.itemLabel) parts.push(segment.itemLabel);
  return parts.length > 0 ? parts.join(" ") : "本文";
}
