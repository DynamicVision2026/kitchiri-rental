/**
 * Shared logic for legal/manifest.json: it is GENERATED from the frontmatter of
 * legal/texts/*.md, never hand-edited. Both `scripts/build-legal-manifest.ts` (the
 * standalone regenerator) and `scripts/citation-verify.ts` (which updates a file's
 * frontmatter when a primary claim is applied, then must regenerate the manifest so
 * the two never drift apart) import this.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LEGAL_DIR = fileURLToPath(new URL("../../legal/", import.meta.url));
export const LEGAL_TEXTS_DIR = `${LEGAL_DIR}texts/`;
export const MANIFEST_PATH = `${LEGAL_DIR}manifest.json`;

export interface LegalFrontmatter {
  id: string;
  type: string;
  citation_group_key: string;
  title_ja: string;
  title_en: string;
  issuer?: string;
  in_force_from?: string;
  published?: string;
  content_kind: string;
  verification_status: string;
  verified: boolean;
}

export interface LegalManifestEntry {
  id: string;
  type: string;
  citation_group_key: string;
  title_ja: string;
  title_en: string;
  issuer: string | null;
  court: string | null;
  in_force_from: string | null;
  published: string | null;
  file: string;
  content_kind: string;
  verification_status: string;
  verified: boolean;
  last_primary_review: string | null;
}

function parseFrontmatter(raw: string): { fm: Record<string, string | boolean>; bodyStart: number } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("legal/texts file is missing YAML frontmatter");
  const fm: Record<string, string | boolean> = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!mm) continue;
    let v: string | boolean = mm[2].trim();
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (/^".*"$/.test(v)) v = v.slice(1, -1);
    fm[mm[1]] = v;
  }
  return { fm, bodyStart: m[0].length };
}

export function listLegalTextFiles(): string[] {
  if (!existsSync(LEGAL_TEXTS_DIR)) return [];
  return readdirSync(LEGAL_TEXTS_DIR).filter((f) => f.endsWith(".md")).sort();
}

export function readLegalFrontmatter(fileName: string): LegalFrontmatter {
  const raw = readFileSync(`${LEGAL_TEXTS_DIR}${fileName}`, "utf8");
  const { fm } = parseFrontmatter(raw);
  return fm as unknown as LegalFrontmatter;
}

/**
 * Rewrites two frontmatter fields (`verification_status`, `verified`) in place,
 * leaving everything else — including the body — untouched. Used only by the
 * citation-verify CLI when a primary claim has already been checked against the
 * file's actual quoted content.
 */
export function updateLegalVerification(id: string, status: string, verified: boolean): string {
  const file = listLegalTextFiles().find((f) => readLegalFrontmatter(f).id === id);
  if (!file) throw new Error(`No legal/texts file with id "${id}"`);
  const path = `${LEGAL_TEXTS_DIR}${file}`;
  const raw = readFileSync(path, "utf8");
  const updated = raw
    .replace(/^verification_status:.*$/m, `verification_status: ${status}`)
    .replace(/^verified:.*$/m, `verified: ${verified}`);
  writeFileSync(path, updated);
  return file;
}

export function regenerateLegalManifest(): LegalManifestEntry[] {
  const entries: LegalManifestEntry[] = listLegalTextFiles().map((f) => {
    const fm = readLegalFrontmatter(f);
    return {
      id: fm.id,
      type: fm.type,
      citation_group_key: fm.citation_group_key,
      title_ja: fm.title_ja,
      title_en: fm.title_en,
      issuer: fm.issuer ?? null,
      court: fm.type === "supreme_court" ? (fm.title_ja.match(/第[一二三]小法廷/)?.[0] ?? null) : null,
      in_force_from: fm.in_force_from ?? null,
      published: fm.published ?? null,
      file: `texts/${f}`,
      content_kind: fm.content_kind,
      verification_status: fm.verification_status,
      verified: fm.verified === true,
      last_primary_review: fm.verified === true ? new Date().toISOString().slice(0, 10) : null,
    };
  });

  const manifest = {
    version: 1,
    generated_from: "legal/texts/*.md frontmatter — do not hand-edit, regenerate with `npm run legal:manifest`",
    generated_at: new Date().toISOString().slice(0, 10),
    scope:
      "Statutes, one MLIT administrative guideline, and Supreme Court judgment citations only. " +
      "No RETIO material (copyrighted) and no lower-court decisions are bundled here.",
    no_runtime_egress:
      "This corpus is bundled at build time. No route in this product fetches a legal source over the network at request time.",
    primary_verified_count: entries.filter((e) => e.verified).length,
    total: entries.length,
    entries,
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return entries;
}
