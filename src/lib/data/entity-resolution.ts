import type { Company, FundOSData, InvestmentLot } from "@/lib/types";

const LEGAL_SUFFIXES = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "llp",
  "plc",
  "corp",
  "corporation",
  "company",
  "co",
  "technologies",
  "technology",
  "tech",
  "solutions",
  "labs",
  "lab",
  "group",
  "holdings",
  "holding",
]);

const STOP_WORDS = new Set(["and", "of", "the", "for", "at", "by"]);

/** High-confidence match — create/reuse without requiring a large score gap. */
export const COMPANY_MATCH_THRESHOLD = 0.88;
/** Exact / near-exact identities bypass the ambiguity margin. */
const EXACTISH = 0.97;
/** If top two scores are this close and neither is exactish, refuse to match. */
const AMBIGUITY_MARGIN = 0.05;

export interface CompanyIdentityInput {
  legal_name?: string | null;
  brand_name?: string | null;
  abbr?: string | null;
  website?: string | null;
  aliases?: readonly string[] | null;
}

export interface CompanyMatch {
  company: Company;
  score: number;
  matchedOn: string;
}

function words(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeCompanyName(value: string | null | undefined): string {
  return words(value ?? "").join("");
}

export function canonicalCompanyName(value: string | null | undefined): string {
  const tokens = words(value ?? "").filter((word) => !LEGAL_SUFFIXES.has(word));
  return tokens.join("");
}

function significantWords(value: string | null | undefined): string[] {
  return words(value ?? "").filter(
    (word) => !LEGAL_SUFFIXES.has(word) && !STOP_WORDS.has(word),
  );
}

function acronym(value: string | null | undefined): string {
  return significantWords(value)
    .map((word) => word[0])
    .join("");
}

function domain(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - range);
    const end = Math.min(i + range + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  const aChars = a.split("").filter((_, i) => aMatches[i]);
  const bChars = b.split("").filter((_, i) => bMatches[i]);
  let transpositions = 0;
  for (let i = 0; i < aChars.length; i++) {
    if (aChars[i] !== bChars[i]) transpositions++;
  }
  const m = matches;
  const jaro =
    (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) {
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Sorted-token Jaccard over significant words — catches word-order / extra-word noise. */
function tokenSetScore(a: string, b: string): number {
  const left = new Set(significantWords(a));
  const right = new Set(significantWords(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection++;
  }
  const union = left.size + right.size - intersection;
  if (union === 0) return 0;
  const jaccard = intersection / union;
  // Reward when the smaller name's tokens are fully covered by the larger.
  const smaller = Math.min(left.size, right.size);
  const containment = smaller > 0 ? intersection / smaller : 0;
  return Math.max(jaccard, containment * 0.96);
}

function containmentScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 5) return 0;
  if (!longer.includes(shorter)) return 0;
  const ratio = shorter.length / longer.length;
  // "superliving" inside "superlivinghomes" — only accept high coverage.
  if (ratio >= 0.85) return 0.96;
  if (ratio >= 0.7) return 0.9;
  return 0;
}

function identityValues(identity: CompanyIdentityInput): string[] {
  return [
    identity.legal_name,
    identity.brand_name,
    identity.abbr,
    ...(identity.aliases ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function pairScore(query: string, candidate: string): number {
  const q = normalizeCompanyName(query);
  const c = normalizeCompanyName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;

  const qCanonical = canonicalCompanyName(query);
  const cCanonical = canonicalCompanyName(candidate);
  if (!qCanonical || !cCanonical) return 0;
  if (qCanonical === cCanonical) return 0.99;

  // Spaced / camelCase / punctuation variants already collapsed above.
  // Token-set + containment catch "Super Living AI" ↔ "SuperLiving".
  const token = tokenSetScore(query, candidate);
  const contain = Math.max(
    containmentScore(qCanonical, cCanonical),
    containmentScore(q, c),
  );

  // Never fuzzy-match very short identifiers — they must hit abbr/acronym paths.
  if (Math.min(qCanonical.length, cCanonical.length) < 5) {
    return Math.max(token >= 0.96 ? token : 0, contain);
  }

  const fuzzy = jaroWinkler(qCanonical, cCanonical);
  // Soften JW for length-mismatched pairs so "SuperLiving" vs "Super Living Pvt Ltd" stays high.
  return Math.max(fuzzy, token, contain);
}

function companyAbbreviationSet(company: CompanyIdentityInput): Set<string> {
  const values = identityValues(company);
  const set = new Set<string>();
  for (const value of values) {
    const normalized = normalizeCompanyName(value);
    if (normalized.length >= 2 && normalized.length <= 8) set.add(normalized);
    const acr = acronym(value);
    if (acr.length >= 2 && acr.length <= 8) set.add(acr);
  }
  return set;
}

function scoreCompany(
  query: CompanyIdentityInput,
  company: CompanyIdentityInput,
): { score: number; matchedOn: string } {
  const queryValues = identityValues(query);
  const companyValues = identityValues(company);
  let best = { score: 0, matchedOn: "" };

  const queryDomain = domain(query.website);
  const companyDomain = domain(company.website);
  if (queryDomain && companyDomain && queryDomain === companyDomain) {
    return { score: 1, matchedOn: "website domain" };
  }

  const companyAbbreviations = companyAbbreviationSet(company);
  const queryAbbreviations = companyAbbreviationSet(query);

  // Query looks like an acronym/abbr of the company (e.g. "SLR" → Super Living …).
  for (const queryValue of queryValues) {
    const queryNormalized = normalizeCompanyName(queryValue);
    if (
      queryNormalized.length >= 2 &&
      queryNormalized.length <= 8 &&
      companyAbbreviations.has(queryNormalized)
    ) {
      const score =
        company.abbr && queryNormalized === normalizeCompanyName(company.abbr)
          ? 1
          : 0.98;
      if (score > best.score) best = { score, matchedOn: "abbreviation/acronym" };
    }
  }

  // Company abbr/alias is the acronym of the query name.
  for (const companyValue of companyValues) {
    const companyNormalized = normalizeCompanyName(companyValue);
    if (
      companyNormalized.length >= 2 &&
      companyNormalized.length <= 8 &&
      queryAbbreviations.has(companyNormalized)
    ) {
      if (0.98 > best.score) best = { score: 0.98, matchedOn: "abbreviation/acronym" };
    }
  }

  for (const queryValue of queryValues) {
    for (const candidateValue of companyValues) {
      const score = pairScore(queryValue, candidateValue);
      if (score > best.score) {
        best = { score, matchedOn: candidateValue };
      }
    }
  }
  return best;
}

/**
 * Resolve a company only when the best candidate is both strong and
 * unambiguous. Exact identities bypass the ambiguity margin.
 */
export function resolveCompany(
  data: Pick<FundOSData, "companies">,
  query: CompanyIdentityInput | string,
  threshold = COMPANY_MATCH_THRESHOLD,
): CompanyMatch | null {
  const identity = typeof query === "string" ? { legal_name: query } : query;
  if (!identityValues(identity).length) return null;

  const ranked = data.companies
    .map((company) => ({ company, ...scoreCompany(identity, company) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < threshold) return null;
  const second = ranked[1];
  if (
    best.score < EXACTISH &&
    second &&
    best.score - second.score < AMBIGUITY_MARGIN
  ) {
    return null;
  }
  return best;
}

/**
 * Deduplicate a batch of extracted company identities against each other
 * before commit, so "Super Living" and "SuperLiving" in one SHA don't create
 * two rows even when neither exists yet.
 */
export function dedupeCompanyIdentities<T extends CompanyIdentityInput>(
  identities: T[],
): T[] {
  const kept: T[] = [];
  for (const identity of identities) {
    if (!identityValues(identity).length) continue;
    const matchIdx = kept.findIndex((existing) => {
      const forward = scoreCompany(identity, existing);
      const reverse = scoreCompany(existing, identity);
      return Math.max(forward.score, reverse.score) >= COMPANY_MATCH_THRESHOLD;
    });
    if (matchIdx < 0) {
      kept.push({
        ...identity,
        aliases: [...(identity.aliases ?? [])],
      });
      continue;
    }
    const existing = kept[matchIdx];
    kept[matchIdx] = {
      ...existing,
      // Prefer the longer / more formal legal name when merging batch dupes.
      legal_name:
        (identity.legal_name?.trim().length ?? 0) >
        (existing.legal_name?.trim().length ?? 0)
          ? identity.legal_name
          : existing.legal_name,
      brand_name: existing.brand_name ?? identity.brand_name ?? null,
      abbr: existing.abbr ?? identity.abbr ?? null,
      website: existing.website ?? identity.website ?? null,
      aliases: mergedCompanyAliases(existing, identity),
    };
  }
  return kept;
}

export function mergedCompanyAliases(
  company: CompanyIdentityInput,
  incoming: CompanyIdentityInput,
): string[] {
  const primary = new Set(
    [company.legal_name, company.brand_name, company.abbr]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeCompanyName),
  );
  const aliases = [
    ...(company.aliases ?? []),
    incoming.legal_name,
    incoming.brand_name,
    incoming.abbr,
    ...(incoming.aliases ?? []),
  ].filter((value): value is string => {
    const normalized = normalizeCompanyName(value);
    return Boolean(normalized) && !primary.has(normalized);
  });
  return [
    ...new Map(
      aliases.map((value) => [normalizeCompanyName(value), value.trim()]),
    ).values(),
  ];
}

/** Attach a resolved name variant onto the company as an alias (no-op if already primary). */
export function withResolvedAlias(
  data: FundOSData,
  companyId: string,
  nameVariant: string | null | undefined,
): FundOSData {
  const trimmed = nameVariant?.trim();
  if (!trimmed) return data;
  return {
    ...data,
    companies: data.companies.map((company) => {
      if (company.id !== companyId) return company;
      const aliases = mergedCompanyAliases(company, { legal_name: trimmed });
      if (
        aliases.length === (company.aliases ?? []).length &&
        aliases.every((alias, i) => alias === (company.aliases ?? [])[i])
      ) {
        return company;
      }
      return {
        ...company,
        aliases,
        updated_at: new Date().toISOString(),
      };
    }),
  };
}

function nearlyEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / scale <= 0.005;
}

function daysApart(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 86_400_000;
}

export interface LotIdentityInput {
  fund_id: string;
  company_id: string;
  round_name?: string | null;
  investment_date: string;
  vehicle?: string | null;
  shares_acquired?: number | null;
  price_per_share_local?: number | null;
  cash_invested_local?: number | null;
  currency?: string | null;
}

/**
 * Strict lot fingerprint: company + fund + near-identical date and multiple
 * matching economics. This catches repeated SHA/import commits without
 * collapsing legitimate follow-on rounds.
 */
export function findDuplicateInvestmentLot(
  data: FundOSData,
  input: LotIdentityInput,
): InvestmentLot | null {
  for (const lot of data.investmentLots) {
    if (lot.company_id !== input.company_id || lot.fund_id !== input.fund_id) continue;
    if (daysApart(lot.investment_date, input.investment_date) > 3) continue;

    const round = data.rounds.find((item) => item.id === lot.round_id);
    let score = lot.investment_date === input.investment_date ? 3 : 2;
    if (nearlyEqual(lot.shares_acquired, input.shares_acquired)) score += 2;
    if (nearlyEqual(lot.price_per_share_local, input.price_per_share_local)) score += 2;
    if (nearlyEqual(lot.cash_invested_local, input.cash_invested_local)) score += 2;
    if (
      input.round_name &&
      round?.round_name &&
      pairScore(input.round_name, round.round_name) >= 0.92
    ) {
      score += 2;
    }
    if (input.vehicle && lot.vehicle === input.vehicle) score += 1;
    if (input.currency && lot.currency === input.currency) score += 1;

    if (score >= 7) return lot;
  }
  return null;
}
