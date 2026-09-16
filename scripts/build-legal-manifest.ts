/**
 * Regenerates legal/manifest.json from legal/texts/*.md frontmatter.
 *
 *   npm run legal:manifest
 *
 * Run this after adding or editing a file in legal/texts/. The manifest is a build
 * artifact of the frontmatter, never hand-edited — see legal/README.md.
 */
import { regenerateLegalManifest } from "./lib/legal-manifest.ts";

const entries = regenerateLegalManifest();
console.log(`legal/manifest.json — ${entries.length} entries, ${entries.filter((e) => e.verified).length} primary-verified`);
for (const e of entries) {
  console.log(`  ${e.verified ? "✔" : " "} ${e.id.padEnd(28)} ${e.verification_status}`);
}
