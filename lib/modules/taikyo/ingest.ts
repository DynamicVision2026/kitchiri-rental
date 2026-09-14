/**
 * 契約書ファイルの取り込み — PDF text extraction for the contract scanner.
 *
 * WHY THIS REFUSES SCANS RATHER THAN GUESSING
 * -------------------------------------------
 * A PDF produced by a word processor carries a text layer and extracts cleanly. A
 * PDF produced by a photocopier is a picture of a page and yields nothing, or a few
 * stray characters from a header stamp.
 *
 * The dangerous case is the second one succeeding *partially*. Empty or fragmentary
 * text flows into segmentation, produces a handful of nonsense clauses, and the
 * dashboard reports a confident-looking verdict over a document it never read — and
 * at the end of that pipeline sits a letter to a landlord. So extraction measures
 * how much text it actually recovered per page and refuses below a floor, with a
 * message telling the user what to do instead. An honest refusal is worth more here
 * than a result that looks like an answer.
 *
 * OCR is deliberately NOT bundled. Japanese OCR over dense contract text has its own
 * error profile — misread digits in 「金120,000円」 change the money, misread 「賃貸人」
 * vs 「賃借人」 inverts who owes what — and wiring that in silently upstream of a
 * legal conclusion needs a deliberate decision about engine, accuracy and review,
 * not a default.
 */

export const MAX_PDF_BYTES = 12 * 1024 * 1024;

/**
 * Below this many characters per page, the document is treated as having no usable
 * text layer. A real lease page carries several hundred characters; a scanned page
 * yields zero, or a few from an OCR stamp the scanner added.
 */
export const MIN_CHARS_PER_PAGE = 60;

export type IngestFailure =
  | "empty_file"
  | "too_large"
  | "not_a_pdf"
  | "no_text_layer"
  | "unreadable";

export interface IngestSuccess {
  ok: true;
  text: string;
  pages: number;
  charsPerPage: number;
}

export interface IngestError {
  ok: false;
  failure: IngestFailure;
  /** Japanese, user-facing, and actionable — this is shown in the upload zone. */
  messageJa: string;
  messageEn: string;
  pages?: number;
  charsPerPage?: number;
}

export type IngestResult = IngestSuccess | IngestError;

const MESSAGES: Record<IngestFailure, { ja: string; en: string }> = {
  empty_file: {
    ja: "ファイルが空のようです。別のファイルをお試しください。",
    en: "The file appears to be empty. Please try another file.",
  },
  too_large: {
    ja: `ファイルサイズが大きすぎます（上限 ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)}MB）。必要なページのみを抽出してお試しください。`,
    en: `The file is too large (limit ${Math.floor(MAX_PDF_BYTES / 1024 / 1024)}MB). Try uploading only the relevant pages.`,
  },
  not_a_pdf: {
    ja: "PDFファイルとして読み取れませんでした。PDF形式のファイルをアップロードしてください。",
    en: "This does not read as a PDF. Please upload a PDF file.",
  },
  no_text_layer: {
    ja:
      "この PDF からは文字情報を取り出せませんでした。スキャンした画像のみの PDF と思われます。" +
      "恐れ入りますが、契約書の条文をコピーして下記のテキスト欄に貼り付けてください。" +
      "画像から文字を読み取る機能（OCR）は、金額や「賃貸人／賃借人」の読み違いが判定結果を左右するため、本診断では使用していません。",
    en:
      "No text could be extracted — this looks like a scanned image PDF. Please paste the clause text into the box below instead. " +
      "OCR is not used here: a misread figure or a 賃貸人/賃借人 confusion would change the legal conclusion.",
  },
  unreadable: {
    ja: "ファイルの読み取り中に問題が発生しました。ファイルが破損していないかご確認ください。",
    en: "Something went wrong reading the file. Please check that it is not corrupted.",
  },
};

function fail(failure: IngestFailure, extra: Partial<IngestError> = {}): IngestError {
  return { ok: false, failure, messageJa: MESSAGES[failure].ja, messageEn: MESSAGES[failure].en, ...extra };
}

/** PDFs start with "%PDF-". Checked before parsing so a mislabelled file fails clearly. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/**
 * Collapses the per-line fragments a PDF text layer produces. Extraction emits one
 * line per rendered line, so a clause wrapped across three lines arrives as three —
 * harmless for the segmenter, which folds continuations into the pending clause, but
 * runs of blank lines would break that, so they are squeezed here.
 */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractContractText(bytes: Uint8Array): Promise<IngestResult> {
  if (bytes.length === 0) return fail("empty_file");
  if (bytes.length > MAX_PDF_BYTES) return fail("too_large");
  if (!looksLikePdf(bytes)) return fail("not_a_pdf");

  let pages = 0;
  let text = "";
  try {
    // Imported lazily so the PDF machinery is only loaded on a request that needs it.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(bytes);
    const result = await extractText(doc, { mergePages: true });
    pages = result.totalPages;
    text = tidy(Array.isArray(result.text) ? result.text.join("\n") : result.text);
  } catch {
    return fail("unreadable");
  }

  const charsPerPage = pages > 0 ? Math.round(text.length / pages) : 0;
  if (text.length === 0 || charsPerPage < MIN_CHARS_PER_PAGE) {
    return fail("no_text_layer", { pages, charsPerPage });
  }
  return { ok: true, text, pages, charsPerPage };
}
