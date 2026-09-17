/**
 * TEST DOUBLE. Not a production engine — see lib/server/audit-store.file.ts for the
 * same pattern elsewhere in this codebase.
 *
 * Lets the OCR route, the confirmation UI, and eval/ocr/'s harness run end-to-end
 * without ANTHROPIC_API_KEY, which is unset in every environment this session had
 * access to. Registered by image byte-length (deterministic, so the same fixture
 * image always produces the same canned pair across passes/runs) — a real caller
 * supplies its own fixtures via `registerFixture`.
 */

import { readFileSync } from "node:fs";
import type { ImageInput, OcrEngine, OcrResult } from "./ocr.ts";

export interface MockFixture {
  /** Byte length of the fixture image this pair answers for. */
  byteLength: number;
  passA: OcrResult;
  passB: OcrResult;
}

export class MockOcrEngine implements OcrEngine {
  readonly id = "mock-ocr-test-double:v1";
  private readonly fixtures = new Map<number, MockFixture>();

  constructor() {
    // Dev-only convenience: OCR_MOCK_FIXTURES_PATH points at a JSON array of
    // MockFixture objects, letting a separately-running `next dev` process (which
    // cannot see registerFixture() calls made from a test script in a different
    // process) load the same fixtures a manual UI walkthrough needs — mirrors
    // AUDIT_STORE_FILE_PATH's role for lib/server/audit-store.file.ts.
    const path = process.env.OCR_MOCK_FIXTURES_PATH;
    if (path) {
      /*turbopackIgnore: true*/
      const raw = readFileSync(/*turbopackIgnore: true*/ path, "utf8");
      for (const fixture of JSON.parse(raw) as MockFixture[]) this.registerFixture(fixture);
    }
  }

  registerFixture(fixture: MockFixture): void {
    this.fixtures.set(fixture.byteLength, fixture);
  }

  async transcribe(image: ImageInput, pass: "a" | "b"): Promise<OcrResult> {
    const fixture = this.fixtures.get(image.bytes.length);
    if (!fixture) {
      throw new Error(
        `MockOcrEngine has no fixture registered for a ${image.bytes.length}-byte image. ` +
          "This test double never invents a transcription — register one with registerFixture().",
      );
    }
    const result = pass === "a" ? fixture.passA : fixture.passB;
    return { lines: result.lines.map((l) => ({ ...l, page: image.page })), raw_text: result.raw_text };
  }
}
