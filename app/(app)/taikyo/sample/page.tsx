import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import "../_design/tokens.css";
import s from "../_screens/screens.module.css";
import { S5Report } from "../_screens/Screens";
import { evaluateContract } from "@/lib/modules/taikyo/batch.ts";
import { toDemoLine, sumsByTier, recoverableTotal } from "@/lib/shared/finding-view.ts";

export const metadata: Metadata = { title: "サンプルレポート" };
export const runtime = "nodejs";

/**
 * Route: /taikyo/sample — replaces the V14 fixture gallery at /taikyo/preview
 * (retired in V15). This is not a fixture: it runs the real engine
 * (evaluateContract, the same function batch-evaluate calls) against the sample
 * lease already committed at tests/fixtures/sample-lease.txt, so what a visitor
 * reads here is a genuine example of the product's own output, clearly labelled as
 * a sample rather than passed off as their own document.
 *
 * Reads the fixture via a plain path.join(process.cwd(), ...) rather than
 * new URL(..., import.meta.url) — the latter hits the same page-vs-route bundling
 * realm mismatch documented at length in
 * app/(app)/taikyo/print/letter/[id]/page.tsx (a different symptom of the same
 * underlying Turbopack issue: a `URL` instance built in one module-bundling context
 * is rejected by a Node fs function expecting its own realm's `URL` class).
 */
export default async function SampleReportPage() {
  const contractText = readFileSync(join(process.cwd(), "tests/fixtures/sample-lease.txt"), "utf8");
  const report = await evaluateContract(contractText);
  const lines = report.findings.map(toDemoLine);
  const sums = sumsByTier(lines);
  const recoverable = recoverableTotal(sums);
  const total = lines.reduce((n, l) => n + l.chargedJpy, 0);

  return (
    <main className="doc">
      <div className={s.wrap}>
        <p className={s.notice} style={{ marginTop: 0 }}>
          これはサンプルです。架空の賃貸借契約書（tests/fixtures/sample-lease.txt）を実際のエンジンで診断した結果で、
          実在の物件やご利用者様のデータではありません。
        </p>
        <S5Report lines={lines} total={total} recoverable={recoverable} />
        <p className={s.tiny} style={{ marginTop: "2rem" }}>
          <Link href="/taikyo/workspace">ご自身の契約書を診断する→</Link>
        </p>
      </div>
    </main>
  );
}
