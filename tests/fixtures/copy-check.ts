/**
 * Copy discipline check.  npm run validate:copy
 *
 * 弁護士法72条 discipline lives in the UI copy as much as in the engine. We describe
 * what the rules say and let the tenant conclude; we do not characterise the
 * landlord's conduct or tell the tenant what they owe.
 *
 * Scans every string a user can see: screen components, phrase banks, fixtures and
 * page copy. Fails the build on a banned term rather than relying on review.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

/** Terms that characterise conduct or assert a legal conclusion. */
const BANNED: { term: string; why: string }[] = [
  { term: "違法", why: "asserts illegality" },
  { term: "不当", why: "characterises the landlord's conduct" },
  { term: "ぼったくり", why: "abusive" },
  { term: "詐欺", why: "alleges a crime" },
  { term: "支払う必要はありません", why: "asserts the tenant owes nothing" },
  { term: "支払う必要はない", why: "asserts the tenant owes nothing" },
];

/** Files whose strings reach a user. */
const SCAN_DIRS = ["app", "lib/phrases", "lib/fixtures", "lib/modules/taikyo"];
const SCAN_EXT = [".tsx", ".ts", ".yaml", ".css"];
/** The ban list itself, and notes explaining why a term is banned, are exempt. */
const EXEMPT = ["tests/fixtures/copy-check.ts"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SCAN_EXT.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => {
  try { return walk(join(ROOT, d)); } catch { return []; }
}).filter((f) => !EXEMPT.some((e) => f.endsWith(e)));

const failures: string[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    // A term inside a code comment explaining the rule is not user-facing copy.
    const isComment = /^\s*(\/\/|\*|\/\*|#)/.test(line);
    for (const { term, why } of BANNED) {
      if (!line.includes(term)) continue;
      if (isComment) continue;
      failures.push(`${file.replace(ROOT, "")}:${i + 1} contains 「${term}」 — ${why}\n      ${line.trim().slice(0, 90)}`);
    }
  });
}

console.log(`copy discipline — ${files.length} files scanned, ${BANNED.length} banned terms`);
if (failures.length) {
  console.error("");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  console.error(`\n${failures.length} violation(s)`);
  process.exit(1);
}
console.log("OK");
