import type { Metadata } from "next";
import TaikyoWorkspace from "./TaikyoWorkspace";

export const metadata: Metadata = {
  title: "原状回復 診断ワークスペース",
  description:
    "賃貸借契約書をアップロードまたは貼り付けると、条項ごとに原状回復特約を判定し、交渉文面まで作成できます。",
};

/** The unified move-out workspace: ingest, analyse, answer, negotiate. Route: /taikyo/workspace */
export default function TaikyoWorkspacePage() {
  return <TaikyoWorkspace />;
}
