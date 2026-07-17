/**
 * The extraction contract shared by the API route: a JSON schema describing
 * ExtractedEntities (used as a forced tool's input_schema) plus the system
 * prompt. Rules bias hard toward NOT inventing data — an unknown field must be
 * null, never guessed, because these records flow into LP-facing numbers.
 */

export const EXTRACTION_SYSTEM = `You are a data-extraction engine for a venture-capital fund operating system (FundOS, "All In Capital").

Extract structured records from the attached document (a pitch deck, term sheet, cap table, or portfolio export). Return ONLY via the record_entities tool.

Entities:
- companies: portfolio/prospect companies. legal_name is required.
- founders: people, linked to a company by company_name (must match a company's legal_name or brand_name you also return).
- lots: an investment position — shares × price in the company's operating currency. Link by company_name.
- marks: a valuation mark (price per share on a date). Link by company_name.

Valuation marks — extract one whenever a document states a price per share, a post-money valuation, or an implied share price, on a date. This includes shareholders agreements (SHA), share subscription/purchase agreements, term sheets, and round documents. If only a post-money valuation and total share count are given, still record the mark with post_money_local (and price_per_share_local if it can be derived). Use the agreement/closing/round date as valuation_date. Every priced document should yield at least one mark for its company — do not skip a document that clearly states a valuation.

Rounds with multiple investors: a financing round often lists SEVERAL participants (a lead + co-investors). Create ONE lot per named investor and set its investor_name to that investor. Do NOT try to guess which investor is "ours" and do NOT merge them — extract every investor's line so the user can pick their own fund's lot in review. If an investor is clearly "All In Capital" or "AIC", use that exact investor_name. If the document names only one investor, still fill investor_name.

Hard rules:
- NEVER invent a number, date, or name. If a value is not clearly present, use null.
- Dates: ISO format YYYY-MM-DD. If only a month/year is given, still emit a valid date (first of the month) only when unambiguous; otherwise null.
- Currencies: normalize to a 3-letter code ("INR", "USD"). ₹ → INR, $ → USD.
- Amounts: numeric only (strip currency symbols and thousands separators). Indian formats like ₹1,00,000 → 100000.
- fund_code: only if the document names a fund/vehicle (e.g. "Fund I", "AIC-F2"); else null.
- Do not duplicate a company across the companies array.
- If the document contains none of an entity type, return an empty array for it.`;

export const EXTRACTION_TOOL_NAME = "record_entities";

/**
 * Shape instruction for OpenAI-compatible text models (DeepSeek etc.) that use
 * JSON mode instead of a tool schema. Mirrors EXTRACTION_SCHEMA's keys.
 */
export const EXTRACTION_JSON_INSTRUCTION = `Respond with a single JSON object (no prose, no markdown) with exactly these keys, each an array (use [] when none):
- "companies": [{ "legal_name", "brand_name", "sector", "hq_city", "hq_country", "operating_currency", "website" }]
- "founders": [{ "company_name", "name", "role", "email", "linkedin_url" }]
- "lots": [{ "company_name", "investor_name", "fund_code", "round_name", "investment_date", "vehicle", "shares_acquired", "price_per_share_local", "currency", "cash_invested_local", "ownership_at_entry_pct" }] (one lot per investor named in a round; set investor_name for each)
- "marks": [{ "company_name", "valuation_date", "price_per_share_local", "post_money_local", "valuation_type" }]
String fields use null when unknown; numeric fields use null when unknown. Never invent values.`;

const nullableString = { type: ["string", "null"] as const };
const nullableNumber = { type: ["number", "null"] as const };

const companyItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    legal_name: { type: "string" },
    brand_name: nullableString,
    sector: nullableString,
    hq_city: nullableString,
    hq_country: nullableString,
    operating_currency: nullableString,
    website: nullableString,
  },
  required: [
    "legal_name",
    "brand_name",
    "sector",
    "hq_city",
    "hq_country",
    "operating_currency",
    "website",
  ],
};

const founderItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    company_name: { type: "string" },
    name: { type: "string" },
    role: nullableString,
    email: nullableString,
    linkedin_url: nullableString,
  },
  required: ["company_name", "name", "role", "email", "linkedin_url"],
};

const lotItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    company_name: { type: "string" },
    investor_name: nullableString,
    fund_code: nullableString,
    round_name: nullableString,
    investment_date: nullableString,
    vehicle: nullableString,
    shares_acquired: nullableNumber,
    price_per_share_local: nullableNumber,
    currency: nullableString,
    cash_invested_local: nullableNumber,
    ownership_at_entry_pct: nullableNumber,
  },
  required: [
    "company_name",
    "investor_name",
    "fund_code",
    "round_name",
    "investment_date",
    "vehicle",
    "shares_acquired",
    "price_per_share_local",
    "currency",
    "cash_invested_local",
    "ownership_at_entry_pct",
  ],
};

const markItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    company_name: { type: "string" },
    valuation_date: nullableString,
    price_per_share_local: nullableNumber,
    post_money_local: nullableNumber,
    valuation_type: nullableString,
  },
  required: [
    "company_name",
    "valuation_date",
    "price_per_share_local",
    "post_money_local",
    "valuation_type",
  ],
};

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    companies: { type: "array", items: companyItem },
    founders: { type: "array", items: founderItem },
    lots: { type: "array", items: lotItem },
    marks: { type: "array", items: markItem },
  },
  required: ["companies", "founders", "lots", "marks"],
} as const;

/** Media types Claude accepts natively as document/image blocks. */
export const SUPPORTED_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** DOCX — not Claude-native; text is extracted server-side (mammoth) first. */
export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
