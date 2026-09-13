import { readFileSync } from "node:fs";

// Load env like Next does.
const t = readFileSync(".env.local", "utf8");
for (const l of t.split(/\r?\n/)) {
  if (!l || l.startsWith("#") || !l.includes("=")) continue;
  const i = l.indexOf("=");
  let v = l.slice(i + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[l.slice(0, i).trim()] ??= v;
}

const { POST } = await import("../src/app/api/ingest/extract/route.ts");

const pdf = readFileSync(
  "/Users/allincapital/.cursor/projects/Users-allincapital-FundOS/attachments/9c23e34f-f622-4787-8061-ade0396790de/Vasuki_India_Subscription_Agreement_compressed__1_.pdf",
);
const payload = {
  fileBase64: pdf.toString("base64"),
  mediaType: "application/pdf",
  filename: "Vasuki_India_Subscription_Agreement.pdf",
};

const req = new Request("http://localhost/api/ingest/extract", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const t0 = Date.now();
const res = await POST(req);
console.log("HTTP", res.status, "in", Date.now() - t0, "ms");
const text = await res.text();
console.log("body head:\n", text.slice(0, 1500));
