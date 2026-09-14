/**
 * Phrase-bank integrity check.  npm run validate:phrases
 *
 * Three things, all of which have a failure mode that would otherwise reach a user
 * as literal "[missing phrase: …]" text in a legal report:
 *   1. every reason code the engine can emit exists in every locale
 *   2. the locales carry identical key sets — no phrase localised in one and not the other
 *   3. no orphan keys sitting in a bank that nothing emits
 *   4. every {placeholder} in a template is one the engine actually supplies
 */

import { REASON_CODES } from "../lib/modules/taikyo/rules.ts";
import { LOCALES, VOCAB_PREFIXES, bankKeys, phrase } from "../lib/phrases/index.ts";
import { PLACEMENTS } from "../lib/modules/taikyo/rules.ts";
import { BAND_KEYS, BAND_LEVELS } from "../lib/modules/taikyo/bands.ts";
import { LETTER_KEYS } from "../lib/modules/taikyo/letter.ts";

/** Identifier vocabularies whose every value must have display text in every locale. */
const VOCABULARIES: Record<(typeof VOCAB_PREFIXES)[number], readonly string[]> = {
  placement: PLACEMENTS,
  band: BAND_KEYS,
  level: BAND_LEVELS,
};

/** Params the engine passes, by code. Keep in step with scoreProngs. */
const SUPPLIED_PARAMS: Record<string, readonly string[]> = {
  "p2.agreed": ["placement"],
  "p2.not_agreed": ["placement"],
  "p3.measured": ["measured", "band", "supported", "elevated", "level"],
};

/** Namespaces owned by the negotiation-letter builder rather than by reason codes. */
const LETTER_PREFIXES = ["letter", "position", "cite"] as const;

const failures: string[] = [];

// Every key the letter builder can reference must exist in both locales.
for (const locale of LOCALES) {
  const keys = new Set(bankKeys(locale));
  for (const key of LETTER_KEYS) {
    if (!keys.has(key)) failures.push(`${locale}: letter builder needs "${key}" but the bank has no entry`);
  }
}

for (const locale of LOCALES) {
  const keys = new Set(bankKeys(locale));
  for (const code of REASON_CODES) {
    if (!keys.has(code)) failures.push(`${locale}: engine emits "${code}" but the bank has no entry for it`);
  }
  for (const key of keys) {
    const isVocab = VOCAB_PREFIXES.some((p) => key.startsWith(`${p}.`));
    const isLetter = LETTER_PREFIXES.some((p) => key.startsWith(`${p}.`));
    if (!isVocab && !isLetter && !(REASON_CODES as readonly string[]).includes(key)) {
      failures.push(`${locale}: "${key}" is in the bank but no engine branch emits it`);
    }
  }
}

for (const locale of LOCALES) {
  const keys = new Set(bankKeys(locale));
  for (const prefix of VOCAB_PREFIXES) {
    for (const value of VOCABULARIES[prefix]) {
      if (!keys.has(`${prefix}.${value}`)) {
        failures.push(`${locale}: vocabulary "${prefix}.${value}" has no display text, so it would leak as a raw identifier`);
      }
    }
  }
}

const [first, ...rest] = LOCALES;
for (const other of rest) {
  const a = new Set(bankKeys(first));
  const b = new Set(bankKeys(other));
  for (const k of a) if (!b.has(k)) failures.push(`"${k}" exists in ${first} but not in ${other}`);
  for (const k of b) if (!a.has(k)) failures.push(`"${k}" exists in ${other} but not in ${first}`);
}

for (const locale of LOCALES) {
  for (const code of REASON_CODES) {
    const rendered = phrase({ code }, locale);
    const leftover = [...rendered.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const supplied = SUPPLIED_PARAMS[code] ?? [];
    for (const name of leftover) {
      if (!supplied.includes(name)) {
        failures.push(`${locale}: "${code}" interpolates {${name}}, which the engine does not supply`);
      }
    }
  }
}

console.log(`phrase bank — ${REASON_CODES.length} reason codes across ${LOCALES.length} locales`);
for (const locale of LOCALES) console.log(`  ${locale}: ${bankKeys(locale).length} entries`);
if (failures.length > 0) {
  console.error("");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nOK");
