"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ImportExportPanel } from "@/components/data/ImportExportPanel";

export default function DataPage() {
  return (
    <>
      <PageHeader
        title="Import / Export"
        description="Back up and restore the full dataset, or bulk import/export portfolio records as JSON, Excel, or CSV."
      />
      <ImportExportPanel />
    </>
  );
}
