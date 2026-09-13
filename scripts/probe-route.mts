import { readFileSync } from "node:fs";

const pdf = readFileSync(
  "/Users/allincapital/.cursor/projects/Users-allincapital-FundOS/attachments/9c23e34f-f622-4787-8061-ade0396790de/Vasuki_India_Subscription_Agreement_compressed__1_.pdf",
);
const payload = {
  fileBase64: pdf.toString("base64"),
  mediaType: "application/pdf",
  filename: "Vasuki_India_Subscription_Agreement.pdf",
};
console.log("payload json MB", (JSON.stringify(payload).length / 1024 / 1024).toFixed(2));

const t0 = Date.now();
const res = await fetch("http://localhost:3000/api/ingest/extract", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
console.log("HTTP", res.status, "in", Date.now() - t0, "ms");
const text = await res.text();
console.log("body head:\n", text.slice(0, 2000));
