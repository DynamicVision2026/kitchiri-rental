import { notFound } from "next/navigation";
import TaikyoAuditFlow from "./TaikyoAuditFlow";
import ContractHealthDashboard from "./ContractHealthDashboard";

const FLOW_STEPS = ["clause", "facts", "result"] as const;
type FlowStep = (typeof FLOW_STEPS)[number];

/** Whole-contract scan. Shares the route so there is one taikyo surface, not two. */
const CONTRACT_STEP = "contract";

function isFlowStep(value: string): value is FlowStep {
  return (FLOW_STEPS as readonly string[]).includes(value);
}

/** Move-out audit surfaces. Route: /taikyo/[step] */
export default async function TaikyoAuditStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (step === CONTRACT_STEP) return <ContractHealthDashboard />;
  if (!isFlowStep(step)) notFound();
  return <TaikyoAuditFlow initialStep={step} />;
}
