"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PortfolioCompanies } from "@/components/dashboard/PortfolioCompanies";
import { ValueMovers } from "@/components/dashboard/ValueMovers";
import { FundAllocation } from "@/components/dashboard/FundAllocation";

export default function PortfolioPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Portfolio Overview"
        description="Holdings marked to market — sortable by value, return and movement."
        addMode="lot"
        addLabel="Add Lot"
      />
      <div className="flex flex-col gap-4">
        <PortfolioCompanies data={data} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ValueMovers data={data} />
          <FundAllocation data={data} />
        </div>
      </div>
    </>
  );
}
