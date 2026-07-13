/**
 * Suggest a company abbreviation from a name (first letters of words).
 * Uniqueness is enforced separately when saving.
 */

const STOP = new Set([
  "pvt",
  "ltd",
  "limited",
  "inc",
  "corp",
  "llc",
  "co",
  "the",
  "and",
  "of",
]);

export function suggestCompanyAbbr(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  let abbr = words.map((w) => w[0]).join("").slice(0, 4);
  if (abbr.length < 2) {
    abbr = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }
  return abbr;
}
