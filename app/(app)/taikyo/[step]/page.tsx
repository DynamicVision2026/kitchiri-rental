/** Core multi-step audit flow for move-out restoration. Route: /taikyo/[step] */
export default async function TaikyoAuditStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  return <main>原状回復 audit flow — step: {step}</main>;
}
