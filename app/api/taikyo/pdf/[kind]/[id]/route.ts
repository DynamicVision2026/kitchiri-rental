/**
 * GET /api/taikyo/pdf/report/:id or /api/taikyo/pdf/letter/:id — the PDF export
 * button on S5/S6.
 *
 * Launches a headless Chromium (Playwright, already a dependency) against the
 * corresponding print route ON THIS SAME SERVER (same origin as the incoming
 * request, so it works under any hostname — localhost during development, whatever
 * the real deployment domain turns out to be — without a separately configured
 * PUBLIC_BASE_URL), and returns what it renders as a PDF.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH if the deployment target does not have Playwright's
 * own downloaded browser available (this sandboxed session does not; it uses the
 * pre-installed Chromium at /opt/pw-browsers/chromium instead — see the harness
 * environment notes). Left unset, Playwright resolves its own bundled browser,
 * which is the normal path for a deployment where `npm install` was allowed to run
 * `playwright install` (the default, unless PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set
 * in that environment too).
 *
 * The access check (paid, not revoked, not expired) lives in the print PAGE, not
 * here — this route renders whatever that page decides to show, including its
 * 404/403/410 states, so a PDF requested for an inaccessible audit produces a short
 * PDF saying so rather than a raw error from this route.
 */

import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";

const KINDS = ["report", "letter"] as const;
type Kind = (typeof KINDS)[number];

// HTTP header VALUES must be Latin-1/ASCII (the Headers API throws otherwise) —
// this is an ASCII debugging hint, deliberately not the Japanese font name itself.
const FONT_FOR: Record<Kind, string> = { report: "gothic", letter: "mincho" };

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }): Promise<NextResponse> {
  const { kind, id } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "invalid_kind", message: `kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const printUrl = `${origin}/taikyo/print/${kind}/${id}`;

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    const response = await page.goto(printUrl, { waitUntil: "load" });
    if (!response || response.status() >= 400) {
      return NextResponse.json(
        { error: "print_route_failed", message: `Print route returned ${response?.status() ?? "no response"}.`, printUrl },
        { status: 502 },
      );
    }
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" } });
    const filename = kind === "report" ? `原状回復診断結果_${id.slice(0, 8)}.pdf` : `原状回復_確認再検討申入書_${id.slice(0, 8)}.pdf`;
    // Content-Disposition's `filename` parameter is a quoted ASCII string; a Japanese
    // name needs the RFC 5987/6266 `filename*=UTF-8''<percent-encoded>` form instead,
    // with a plain ASCII `filename=` fallback for clients that ignore filename*.
    const asciiFallback = kind === "report" ? "taikyo-report.pdf" : "taikyo-letter.pdf";
    return new NextResponse(new Blob([new Uint8Array(pdf)]), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-taikyo-pdf-font-hint": FONT_FOR[kind as Kind],
      },
    });
  } finally {
    await browser.close();
  }
}
