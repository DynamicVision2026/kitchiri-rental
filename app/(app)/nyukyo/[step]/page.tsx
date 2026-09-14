/** Core multi-step audit flow for move-in costs. Route: /nyukyo/[step] */
export default async function NyukyoAuditStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  return <main>初期費用 audit flow — step: {step}</main>;
}
