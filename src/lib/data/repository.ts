/**
 * Server-side data source. Reads the dataset from the relational Supabase
 * tables using the service-role client; falls back to bootstrap data when
 * Supabase is unconfigured or empty.
 */

import type { FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRelationalData, readAllTables } from "@/lib/data/supabase-tables";

export async function getFundOSData(): Promise<FundOSData> {
  const sb = getSupabaseAdminClient();
  if (sb) {
    try {
      const data = await readAllTables(sb);
      if (hasRelationalData(data)) return data;
    } catch {
      /* fall through to bootstrap */
    }
  }
  return createBootstrapData();
}
