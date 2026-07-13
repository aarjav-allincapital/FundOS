"use client";

import { useFundOS } from "@/providers/FundOSProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { CompanyDirectory } from "@/components/dashboard/CompanyDirectory";

export default function CompaniesPage() {
  const { data } = useFundOS();
  return (
    <>
      <PageHeader
        title="Company Directory"
        description="Portfolio companies — entered once, referenced by all lots and marks."
        addMode="company"
        addLabel="Add Company"
      />
      <CompanyDirectory data={data} />
    </>
  );
}
