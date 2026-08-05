/**
 * Simulation set 10: company entity resolution — fuzzy names, aliases,
 * acronyms, within-batch dedupe, and lot-level duplicate blocking.
 */

import { createBootstrapData, FUND_IDS } from "@/lib/data/bootstrap";
import { addCompany, addInvestmentLot } from "@/lib/data/mutations";
import {
  canonicalCompanyName,
  dedupeCompanyIdentities,
  findDuplicateInvestmentLot,
  normalizeCompanyName,
  resolveCompany,
} from "@/lib/data/entity-resolution";
import { applyEntities } from "@/lib/ingest/commit";
import { emptyEntities } from "@/lib/ingest/types";

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  ❌ ${name} ${detail}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

const identityFx = {
  resolveTransactionFx: async () => 1,
  resolveReportingFxMap: async () => ({}),
};

function scenario30() {
  console.log("\n[30] normalize collapses Super Living ↔ SuperLiving");
  check(
    "normalized equal",
    normalizeCompanyName("Super Living") === normalizeCompanyName("SuperLiving"),
  );
  check(
    "legal suffix stripped in canonical form",
    canonicalCompanyName("Super Living") ===
      canonicalCompanyName("SuperLiving Pvt. Ltd."),
  );
}

function scenario31() {
  console.log("\n[31] resolveCompany: spacing / camelCase / alias / abbr");
  let data = createBootstrapData();
  data = addCompany(data, {
    legal_name: "Super Living Pvt Ltd",
    brand_name: "SuperLiving",
    abbr: "SLR",
    aliases: ["Super Living"],
    operating_currency: "INR",
  });

  const bySpace = resolveCompany(data, "Super Living");
  const byCamel = resolveCompany(data, "SuperLiving");
  const byAbbr = resolveCompany(data, "SLR");
  const byAliasDoc = resolveCompany(data, {
    legal_name: "Super Living AI",
    aliases: ["SuperLiving"],
  });

  check("matches spaced name", bySpace?.company.legal_name === "Super Living Pvt Ltd");
  check("matches camelCase brand", byCamel?.company.id === bySpace?.company.id);
  check("matches abbreviation SLR", byAbbr?.company.id === bySpace?.company.id);
  check(
    "matches via alias on query",
    byAliasDoc?.company.id === bySpace?.company.id,
    `score ${byAliasDoc?.score}`,
  );
  check("unknown company stays null", resolveCompany(data, "Totally Different Co") == null);
}

function scenario32() {
  console.log("\n[32] dedupeCompanyIdentities collapses batch variants");
  const batch = dedupeCompanyIdentities([
    { legal_name: "Super Living", brand_name: "SuperLiving", operating_currency: "INR" },
    { legal_name: "SuperLiving", aliases: ["SLR"], operating_currency: "INR" },
    { legal_name: "Unrelated Robotics", operating_currency: "USD" },
  ]);
  check("2 identities after dedupe", batch.length === 2, `got ${batch.length}`);
  const superLiving = batch.find((c) =>
    normalizeCompanyName(c.legal_name).includes("superliving"),
  );
  check(
    "merged aliases retained",
    Boolean(superLiving?.aliases?.some((a) => normalizeCompanyName(a) === "slr" || normalizeCompanyName(a) === "superliving")),
    `aliases ${JSON.stringify(superLiving?.aliases)}`,
  );
}

async function scenario33() {
  console.log("\n[33] applyEntities: SHA re-ingest reuses company + lot");
  let data = createBootstrapData();
  const first = {
    ...emptyEntities(),
    companies: [
      {
        legal_name: "Super Living Pvt Ltd",
        brand_name: "SuperLiving",
        aliases: ["SLR"],
        operating_currency: "INR",
      },
    ],
    lots: [
      {
        company_name: "SuperLiving",
        fund_code: "F2",
        round_name: "Seed",
        investment_date: "2025-03-01",
        shares_acquired: 1000,
        price_per_share_local: 50,
        currency: "INR",
        cash_invested_local: 50_000,
      },
    ],
  };
  const r1 = await applyEntities(data, first, identityFx);
  data = r1.data;
  check("first commit creates company", r1.summary.companiesCreated === 1);
  check("first commit creates lot", r1.summary.lots === 1);

  const second = {
    ...emptyEntities(),
    companies: [
      {
        legal_name: "Super Living",
        aliases: ["SuperLiving"],
        operating_currency: "INR",
      },
    ],
    lots: [
      {
        company_name: "SLR",
        fund_code: "F2",
        round_name: "Seed",
        investment_date: "2025-03-01",
        shares_acquired: 1000,
        price_per_share_local: 50,
        currency: "INR",
        cash_invested_local: 50_000,
      },
    ],
  };
  const beforeCompanies = data.companies.length;
  const beforeLots = data.investmentLots.length;
  const r2 = await applyEntities(data, second, identityFx);
  check(
    "second commit reuses company",
    r2.summary.companiesCreated === 0 && r2.summary.companiesReused === 1,
    `created ${r2.summary.companiesCreated} reused ${r2.summary.companiesReused}`,
  );
  check(
    "second commit reuses lot",
    r2.summary.lots === 0 && r2.summary.lotsReused === 1,
    `lots ${r2.summary.lots} reused ${r2.summary.lotsReused}`,
  );
  check("company count unchanged", r2.data.companies.length === beforeCompanies);
  check("lot count unchanged", r2.data.investmentLots.length === beforeLots);
}

function scenario34() {
  console.log("\n[34] findDuplicateInvestmentLot blocks same economics");
  let data = createBootstrapData();
  data = addCompany(data, {
    legal_name: "Dup Lot Co",
    operating_currency: "INR",
  });
  const company = data.companies.find((c) => c.legal_name === "Dup Lot Co")!;
  data = addInvestmentLot(data, {
    fund_id: FUND_IDS.F2,
    company_id: company.id,
    round_name: "Seed",
    investment_date: "2025-04-01",
    vehicle: "ccps",
    shares_acquired: 200,
    price_per_share_local: 10,
    currency: "INR",
    cash_invested_local: 2000,
    fx_rate_at_entry: 1,
  });
  const dup = findDuplicateInvestmentLot(data, {
    fund_id: FUND_IDS.F2,
    company_id: company.id,
    round_name: "Seed Round",
    investment_date: "2025-04-01",
    shares_acquired: 200,
    price_per_share_local: 10,
    cash_invested_local: 2000,
    currency: "INR",
    vehicle: "ccps",
  });
  check("duplicate lot detected", Boolean(dup));
}

async function main() {
  scenario30();
  scenario31();
  scenario32();
  await scenario33();
  scenario34();
  console.log(
    `\n==== ${checks - failures}/${checks} checks passed, ${failures} failures ====`,
  );
  process.exit(failures > 0 ? 1 : 0);
}

main();
