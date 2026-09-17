/**
 * Picks the OcrEngine, mirroring lib/server/audit-store.ts's getAuditStore() —
 * same reasoning, same guard. The real engine (ClaudeOcrEngine) whenever
 * ANTHROPIC_API_KEY is configured; the mock only by explicit opt-in
 * (`OCR_ENGINE=mock`), refused outright in production.
 */

import type { OcrEngine } from "./ocr.ts";
import { ClaudeOcrEngine } from "./ocr-claude.ts";
import { MockOcrEngine } from "./ocr-mock.ts";

let cached: OcrEngine | null = null;

export function getConfiguredOcrEngine(): OcrEngine {
  if (cached) return cached;

  const forced = process.env.OCR_ENGINE;
  if (forced === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "OCR_ENGINE=mock is refused in production. This is a test double that never " +
          "actually reads an image — configure ANTHROPIC_API_KEY instead.",
      );
    }
    cached = new MockOcrEngine();
    return cached;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    cached = new ClaudeOcrEngine();
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("No OCR engine configured: set ANTHROPIC_API_KEY.");
  }

  throw new Error(
    "No OCR engine configured. Set ANTHROPIC_API_KEY for the real engine, or " +
      "OCR_ENGINE=mock for local development against registered fixtures.",
  );
}

/** Test-only: forces a fresh engine on the next getConfiguredOcrEngine() call. */
export function resetOcrEngineForTests(): void {
  cached = null;
}

/** Test-only: injects a specific engine instance directly, bypassing env-based
 *  selection — used to hand the route a MockOcrEngine that already has fixtures
 *  registered on it (registration must happen before the engine is cached). */
export function setOcrEngineForTests(engine: OcrEngine): void {
  cached = engine;
}
