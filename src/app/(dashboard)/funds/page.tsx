"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FundOverview } from "@/components/dashboard/FundOverview";

export default function FundsPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Fund Overview"
        description="Per-vehicle NAV, deployment and return multiples."
      />
      <FundOverview data={data} />
    </>
  );
}
