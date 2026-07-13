"use client";

import type { FundOSData } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { RecordActions } from "@/components/forms/RecordActions";
import { Mail, Linkedin } from "lucide-react";
export function FounderDirectory({ data }: { data: FundOSData }) {
  const rows = data.founders
    .map((f) => ({
      founder: f,
      company: data.companies.find((c) => c.id === f.company_id) ?? null,
    }))
    .sort((a, b) => Number(b.founder.is_primary) - Number(a.founder.is_primary));

  return (
    <Panel className="h-full">
      <PanelHeader
        title="Founder Directory"
        subtitle={`${rows.length} founders across the portfolio`}
      />
      <Table>
        <THead>
          <TH>Founder</TH>
          <TH>Role</TH>
          <TH>Company</TH>
          <TH>Contact</TH>
          <TH className="w-16" />
        </THead>
        <TBody>
          {rows.map(({ founder, company }) => (
            <TR key={founder.id}>
              <TD strong>
                <div className="flex items-center gap-2">
                  {founder.name}
                  {founder.is_primary && <Badge tone="info">Primary</Badge>}
                </div>
              </TD>
              <TD muted>{founder.role ?? "—"}</TD>
              <TD muted>{company?.brand_name ?? company?.legal_name ?? "—"}</TD>
              <TD>
                <div className="flex items-center gap-2 text-ink-faint">
                  {founder.email && (
                    <a href={`mailto:${founder.email}`} title={founder.email} className="hover:text-ink">
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {founder.linkedin_url && (
                    <a href={founder.linkedin_url} target="_blank" rel="noreferrer" className="hover:text-ink">
                      <Linkedin className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {!founder.email && !founder.linkedin_url && <span>—</span>}
                </div>
              </TD>
              <TD>
                <RecordActions mode="founder" recordId={founder.id} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}
