"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FounderDirectory } from "@/components/dashboard/FounderDirectory";

export default function FoundersPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Founder Directory"
        description="Key people across the portfolio."
        addMode="founder"
        addLabel="Add Founder"
      />
      <FounderDirectory data={data} />
    </>
  );
}
