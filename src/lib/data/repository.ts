/**
 * Server-side fallback — client reads from localStorage via FundOSProvider.
 * Swap this for Supabase when migrating.
 */

import type { FundOSData } from "@/lib/types";
import { createBootstrapData } from "@/lib/data/bootstrap";

export function getFundOSData(): FundOSData {
  return createBootstrapData();
}
