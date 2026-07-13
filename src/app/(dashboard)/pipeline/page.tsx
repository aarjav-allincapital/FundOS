"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DeploymentPipeline } from "@/components/dashboard/DeploymentPipeline";
import { PendingTermSheets } from "@/components/dashboard/PendingTermSheets";

export default function PipelinePage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Deployment Pipeline"
        description="Pre-close deals, term sheets and deals requiring action."
        addMode="deal"
        addLabel="Add Deal"
      />
      <div className="flex flex-col gap-4">
        <DeploymentPipeline data={data} />
        <PendingTermSheets data={data} />
      </div>
    </>
  );
}
