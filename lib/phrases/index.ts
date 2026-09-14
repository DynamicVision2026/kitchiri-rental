/**
 * Phrase bank loader.
 *
 * SERVER ONLY. This reads YAML off disk with node:fs, so it must never reach the
 * browser bundle. The API route resolves phrases and returns finished strings; the
 * client receives text, never the bank.
 *
 * The engine emits reason CODES, not prose. That is what makes localisation possible
 * at all, and it also means a wording change is a content edit rather than a code
 * change — the rule logic and the words a tenant reads move independently.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export interface ReasonRef {
  /** Dotted key into the phrase bank, e.g. "p3.measured". */
  code: string;
  /** Values interpolated into {placeholders}. */
  params?: Readonly<Record<string, string | number>>;
}

type Bank = Readonly<Record<string, string>>;

/** Flattens the nested YAML into "p1.deferred" -> "…" so lookups are a single map. */
function flatten(node: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (node === null || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

/**
 * URLs are built with STATIC specifiers, one per locale, and deliberately not with
 * `new URL(`./${locale}.yaml`, ...)`. A bundler can only emit a file as an asset and
 * rewrite the path when it can see the specifier at build time; the template version
 * built, ran, and silently resolved both locales to the same file — Japanese reasons
 * came back as English text with no error anywhere. Keep these literal.
 */
const LOCALE_URLS: Readonly<Record<Locale, URL>> = {
  ja: new URL("./ja.yaml", import.meta.url),
  en: new URL("./en.yaml", import.meta.url),
};

function load(locale: Locale): Bank {
  return flatten(parse(readFileSync(fileURLToPath(LOCALE_URLS[locale]), "utf8")));
}

const BANKS: Readonly<Record<Locale, Bank>> = { ja: load("ja"), en: load("en") };

/** Every key present in the bank, for the parity check and for tests. */
export function bankKeys(locale: Locale): string[] {
  return Object.keys(BANKS[locale]).sort();
}

/**
 * Resolves a reason to display text. A missing key returns the code itself rather
 * than throwing: a phrase gap should degrade to something a developer can grep for,
 * not take down an evaluation mid-request. `validate:phrases` is what stops gaps
 * reaching production.
 */
/**
 * Params whose VALUE is itself an identifier needing translation. The engine passes
 * `placement: "lease_body"`; without this the Japanese sentence would read
 * 「lease_body に記載されており」 — grammatically Japanese, with a raw enum in the middle.
 */
const VOCAB_PARAMS: Readonly<Record<string, string>> = {
  placement: "placement",
  band: "band",
  level: "level",
};

export const VOCAB_PREFIXES = ["placement", "band", "level"] as const;

export function phrase(ref: ReasonRef, locale: Locale): string {
  const template = BANKS[locale][ref.code];
  if (template === undefined) return `[missing phrase: ${ref.code}]`;
  if (!ref.params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = ref.params?.[name];
    if (value === undefined) return whole;
    const prefix = VOCAB_PARAMS[name];
    if (prefix !== undefined) {
      const localized = BANKS[locale][`${prefix}.${String(value)}`];
      if (localized !== undefined) return localized;
    }
    return String(value);
  });
}

/** Both locales at once — what the API returns so a client can switch without a refetch. */
export function phrases(ref: ReasonRef): Record<Locale, string> {
  return { ja: phrase(ref, "ja"), en: phrase(ref, "en") };
}
