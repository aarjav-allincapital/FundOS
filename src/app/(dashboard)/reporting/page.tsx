"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ReportingStatus } from "@/components/dashboard/ReportingStatus";

export default function ReportingPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Reporting"
        description="NAV readiness, mark approval status and exports."
      />
      <ReportingStatus data={data} />
    </>
  );
}
