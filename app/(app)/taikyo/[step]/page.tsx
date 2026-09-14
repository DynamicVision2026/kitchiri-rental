import { notFound, redirect } from "next/navigation";
import TaikyoAuditFlow from "./TaikyoAuditFlow";

const FLOW_STEPS = ["clause", "facts", "result"] as const;
type FlowStep = (typeof FLOW_STEPS)[number];

function isFlowStep(value: string): value is FlowStep {
  return (FLOW_STEPS as readonly string[]).includes(value);
}

/**
 * Single-clause audit flow. Route: /taikyo/[step]
 *
 * The whole-contract scan used to live here as /taikyo/contract; it is now part of
 * the unified workspace, and the old path redirects so any link already shared keeps
 * working.
 */
export default async function TaikyoAuditStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (step === "contract") redirect("/taikyo/workspace");
  if (!isFlowStep(step)) notFound();
  return <TaikyoAuditFlow initialStep={step} />;
}
