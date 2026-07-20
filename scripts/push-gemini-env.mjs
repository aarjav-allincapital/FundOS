import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const vercel = join(process.env.APPDATA ?? "", "npm", "vercel.cmd");

function pushEnv(key, target) {
  const val = env[key];
  if (!val) {
    console.log(`SKIP ${key}`);
    return;
  }
  try {
    execFileSync(
      vercel,
      ["env", "add", key, target, "--force", "--yes", "--sensitive"],
      { input: val, stdio: ["pipe", "pipe", "pipe"], shell: true }
    );
    console.log(`OK ${key}/${target}`);
  } catch (e) {
    console.error(`FAIL ${key}/${target}`, e.stderr?.toString() ?? e.stdout?.toString() ?? e.message);
  }
}

for (const key of ["GEMINI_API_KEY", "GEMINI_MODEL"]) {
  for (const target of ["production", "preview"]) {
    pushEnv(key, target);
  }
}
