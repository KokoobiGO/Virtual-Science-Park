/**
 * Writes docs/scope-policy.md from lib/copilot/policy.ts (B2).
 *
 *   npx tsx lib/copilot/write-policy-doc.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderScopePolicyDoc } from "./policy";

const target = fileURLToPath(new URL("../../docs/scope-policy.md", import.meta.url));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderScopePolicyDoc());
console.log(`Wrote ${target}`);
