"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InvestmentLots } from "@/components/dashboard/InvestmentLots";

export default function LotsPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Investment Lots"
        description="Cost basis, fair value and return per investment lot."
        addMode="lot"
        addLabel="Add Lot"
      />
      <InvestmentLots data={data} />
    </>
  );
}
