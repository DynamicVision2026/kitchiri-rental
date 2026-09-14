import { notFound } from "next/navigation";
import TaikyoAuditFlow from "./TaikyoAuditFlow";

const STEPS = ["clause", "facts", "result"] as const;
type Step = (typeof STEPS)[number];

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

/** Core multi-step audit flow for move-out restoration. Route: /taikyo/[step] */
export default async function TaikyoAuditStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!isStep(step)) notFound();
  return <TaikyoAuditFlow initialStep={step} />;
}
