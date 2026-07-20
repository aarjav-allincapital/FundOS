"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { LpReportCompose } from "@/components/dashboard/LpReportCompose";

export default function ReportingPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Reporting"
        description="Select relevant fund information, preview the branded update, and send it to LPs, or download a PDF/Excel."
      />
      <LpReportCompose data={data} />
    </>
  );
}
