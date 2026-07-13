"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PortfolioOverview } from "@/components/dashboard/PortfolioOverview";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export default function OverviewPage() {
  const { data } = useFundOS();

  return (
    <>
      <PageHeader
        title="Command Center"
        description="Live portfolio value, deployment and recent activity."
        addMode="company"
        addLabel="Add Company"
      />
      <div className="flex flex-col gap-4">
        <PortfolioOverview data={data} />
        <RecentActivity data={data} />
      </div>
    </>
  );
}
