import { headers } from "next/headers";
import "../../../_design/tokens.css";
import s from "../../print.module.css";
import { getAuditStore, isAuditAccessible } from "@/lib/server/audit-store.ts";
import type { BatchFinding, LetterClause, LetterResult, LetterRefusal } from "@/lib/shared/taikyo-client.ts";

export const runtime = "nodejs";

const LETTERABLE = new Set(["unenforceable", "severable", "reducible", "needs_review"]);

function UnavailablePage({ status, message }: { status: string; message: string }) {
  return (
    <main className="doc">
      <div className={s.letterPage}>
        <h1>{status}</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}

/**
 * Builds the letter via an internal call to the EXISTING /api/taikyo/letter route,
 * rather than importing lib/modules/taikyo/letter.ts directly.
 *
 * That import works fine from a route handler (the API route itself proves it), but
 * fails from a PAGE component's module graph: letter.ts pulls in lib/phrases/index.ts,
 * whose `new URL("./ja.yaml", import.meta.url)` resolves against a different `URL`
 * realm when reached through Next's page/RSC bundling than through its route-handler
 * bundling, and `fileURLToPath()` then rejects it ("Received an instance of URL" —
 * of the WRONG URL class). Going through the API route sidesteps the mismatch
 * entirely and matches this codebase's existing convention that engine internals are
 * imported by API routes only, never by pages or client code (see
 * lib/shared/taikyo-client.ts's own file-level comment).
 */
async function buildLetterViaApi(clauses: LetterClause[]): Promise<LetterResult | LetterRefusal> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const res = await fetch(`${proto}://${host}/api/taikyo/letter`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clauses }),
    cache: "no-store",
  });
  const body = await res.json();
  return body.letter as LetterResult | LetterRefusal;
}

export default async function LetterPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getAuditStore().get(id);

  if (!record) return <UnavailablePage status="404 Not Found" message="該当する診断結果が見つかりませんでした。" />;
  if (record.revokedAt) return <UnavailablePage status="403 Forbidden" message="この購入は返金処理済みのため、文面をご利用いただけません。" />;
  if (!isAuditAccessible(record)) return <UnavailablePage status="410 Gone" message="この診断結果は保存期間（90日間）を過ぎたため、削除されました。" />;

  const findings = record.report.findings as BatchFinding[];
  const clauses: LetterClause[] = findings
    .filter((f) => LETTERABLE.has(f.evaluation.verdict))
    .map((f) => ({ label: f.label, clauseText: f.text, verdict: f.evaluation.verdict, code: f.evaluation.code, amountJpy: f.amounts.headlineJpy }));

  const letter = await buildLetterViaApi(clauses);

  if (!letter.ok) {
    return <UnavailablePage status="文面を作成できません" message={letter.reason} />;
  }

  return (
    <main className="doc">
      <div className={s.letterPage}>
        <pre className={s.letterBody}>{letter.text}</pre>
      </div>
    </main>
  );
}
