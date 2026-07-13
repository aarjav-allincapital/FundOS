"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FxSummary } from "@/components/dashboard/FxSummary";

export default function FxPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="FX Engine"
        description="Cross-currency rates powering multi-currency NAV."
      />
      <FxSummary data={data} />
    </>
  );
}
