import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function value(name) {
  const match = config.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`));
  return match?.[1]?.trim();
}

const teamDomain = value("ACCESS_TEAM_DOMAIN");
const audience = value("ACCESS_AUD");
const authMode = value("AUTH_MODE");
const provision = value("ACCESS_PROVISION");
const failures = [];

if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(teamDomain ?? "")) {
  failures.push("ACCESS_TEAM_DOMAIN must be the real https://<team>.cloudflareaccess.com value");
}
if (!audience || audience.includes("REPLACE") || /\s/.test(audience)) {
  failures.push("ACCESS_AUD must be the real Worker Access application AUD tag");
}
if (authMode !== "access")
  failures.push(`AUTH_MODE must be "access" for deployment (found ${JSON.stringify(authMode)})`);
if (provision !== "on" && provision !== "off") {
  failures.push(`ACCESS_PROVISION must be "on" or "off" (found ${JSON.stringify(provision)})`);
}

if (failures.length > 0) {
  console.error(`Access deployment configuration is incomplete:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Access deployment configuration is complete.");
