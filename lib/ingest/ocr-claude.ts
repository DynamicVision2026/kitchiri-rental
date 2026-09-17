/**
 * ClaudeOcrEngine — the concrete OcrEngine (V16 Task 1/0) behind lib/ingest/ocr.ts's
 * interface. A cloud multimodal model used for transcription only, per the ticket's
 * decision: it converts pixels to `OcrLine[]` and nothing else. See ocr.ts's
 * file-level comment for exactly where the boundary with the judgment engine sits.
 *
 * NOT EXERCISED AGAINST A LIVE MODEL. No ANTHROPIC_API_KEY was available in the
 * session that wrote this file, so this class has never actually transcribed an
 * image — see the honest accuracy report eval:ocr-accuracy produces (or refuses to
 * produce) in eval/ocr/. What IS verified without a live call: the schema this
 * class asks the model to fill (OCR_RESULT_SCHEMA, checked by
 * tests/fixtures/dual-pass-check.ts's fixtures, which are hand-built to the exact
 * same shape) and everything downstream of a transcription (dual-pass.ts).
 *
 * Two passes, two genuinely different prompt framings — not the same prompt run
 * twice, which would just double-bill for the same systematic misread. Pass A reads
 * naturally; pass B re-derives every figure digit group by digit group before
 * stating it. Two engine instances (e.g. two different model settings) is an
 * equally valid way to satisfy the ticket's "different prompt framings or different
 * engine settings" — swap PROMPT_B's approach for a temperature/model change if a
 * real deployment finds that catches more real misreads; nothing outside this file
 * needs to know which.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { FIELD_CLASSES, type ImageInput, type OcrEngine, type OcrResult, OcrEngineError } from "./ocr.ts";

const MODEL = "claude-opus-5";

const OcrLineSchema = z.object({
  text: z.string(),
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  }),
  page: z.number().int().min(1),
  field_class: z.enum(FIELD_CLASSES),
  confidence: z.number().min(0).max(1),
});

const OcrResultSchema = z.object({
  lines: z.array(OcrLineSchema),
  raw_text: z.string(),
});

const SHARED_INSTRUCTIONS = `
あなたは日本の賃貸借関連書類（精算書・領収書・手書きメモ等）の写真から文字を書き起こす専門家です。
以下の点を厳守してください。

- 見えている文字だけを書き起こしてください。読めない・推測が必要な部分は、無理に埋めず、
  該当行の confidence を低く設定してください。
- 各行について、画像全体に対する相対位置（0〜1で正規化した x, y, w, h）を可能な限り正確に
  報告してください。この座標は、後で人間が「この行は画像のこの部分から来た」と確認するために
  使われる、安全機構の中核です。
- 各行を field_class で分類してください: amount（金額）, date（日付）, name（氏名・当事者名）,
  label（費目・項目名）, other（その他）。
- 金額は、印字されている通りの文字列で書き起こしてください（例:「金120,000円」であれば
  そのまま）。読み取った数字を勝手に丸めたり、桁を推測で補ったりしないでください。
- 印影（受付印・訂正印等）で文字が隠れている場合、隠れた部分を推測せず、判読できた範囲のみを
  書き起こし、confidence を低くしてください。
`.trim();

const PASS_A_PROMPT = `${SHARED_INSTRUCTIONS}

このパスでは、通常の読み順（上から下、右から左または左から右、書類のレイアウトに従う）で
自然に読み取ってください。`;

const PASS_B_PROMPT = `${SHARED_INSTRUCTIONS}

このパスでは、特に amount（金額）と date（日付）の各行について、以下の手順で独立に検算して
ください（他のパスでの読み取り結果は見ていません — ゼロから読み直してください）。

1. 数字を一桁ずつ声に出すように内部で確認する（例:「1」「2」「0」「,」「0」「0」「0」「円」）。
2. カンマ区切り（三桁区切り）の位置から桁数が妥当か再確認する。
3. 日付は「年」「月」「日」を個別に確認し、元号か西暦かを明記した書き起こしにする。

この慎重な再検算の結果を報告してください。`;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export class ClaudeOcrEngine implements OcrEngine {
  readonly id: string;
  private readonly client: Anthropic;

  constructor(opts: { apiKey?: string } = {}) {
    // Anthropic() with no args resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
    // an `ant auth login` profile itself — only override when a caller has a
    // specific key to inject.
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
    this.id = `claude-ocr:${MODEL}:v1`;
  }

  async transcribe(image: ImageInput, pass: "a" | "b"): Promise<OcrResult> {
    const prompt = pass === "a" ? PASS_A_PROMPT : PASS_B_PROMPT;
    try {
      const response = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        output_config: { format: zodOutputFormat(OcrResultSchema) },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: toBase64(image.bytes) } },
              { type: "text", text: prompt },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal") {
        throw new OcrEngineError(`Transcription refused (pass ${pass}).`);
      }
      if (!response.parsed_output) {
        throw new OcrEngineError(`Model response did not parse against the OCR schema (pass ${pass}).`);
      }

      // The model reports page numbers itself only when it can infer them from
      // context; for a single ImageInput we know the page authoritatively, so it
      // is stamped here rather than trusted blindly from the model's own count.
      const lines = response.parsed_output.lines.map((l) => ({ ...l, page: image.page }));
      return { lines, raw_text: response.parsed_output.raw_text };
    } catch (e) {
      if (e instanceof OcrEngineError) throw e;
      throw new OcrEngineError(`OCR transcription failed (pass ${pass}): ${e instanceof Error ? e.message : String(e)}`, e);
    }
  }
}

let cached: ClaudeOcrEngine | null = null;

/** Lazily constructed so importing this module never requires an API key at
 *  module-load time — only the first actual transcribe() call does. */
export function getOcrEngine(): OcrEngine {
  if (!cached) cached = new ClaudeOcrEngine();
  return cached;
}
