import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { maskSecrets, scan, type ScanResult } from "./engine/scan.ts";

// Usage: node yusa.mjs <file|dir>... [--json]
// Dirs are walked for SKILL.md and *.md. Exit 2 if any file blocks, 1 if any needs review.
const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.filter((a) => a !== "--json");

function walk(p: string, out: string[]): string[] {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (e !== "node_modules" && e !== ".git") walk(join(p, e), out);
  } else if (/\.md$/i.test(p)) out.push(p);
  return out;
}

const files = targets.flatMap((t) => walk(t, []));
const results: { file: string; r: ScanResult }[] = files.map((f) => ({ file: f, r: scan(readFileSync(f, "utf8"), { mode: "skill" }) }));

if (json) {
  console.log(JSON.stringify(results.map(({ file, r }) => ({
    file: relative(process.cwd(), file),
    verdict: r.verdict,
    score: r.score,
    findings: r.findings.map((f) => ({ id: f.id, layer: f.layer, why: f.why, match: maskSecrets(f.match) })),
    hidden: r.hiddenText.map((h) => ({ layer: h.layer, text: maskSecrets(h.text).slice(0, 160) })),
  }))));
} else {
  for (const { file, r } of results) {
    console.log(`${r.verdict.toUpperCase().padEnd(6)} ${String(r.score).padStart(3)}  ${relative(process.cwd(), file)}`);
    for (const f of r.findings) console.log(`         ${f.id} [${f.layer}] ${f.why} «${maskSecrets(f.match)}»`);
    for (const h of r.hiddenText) console.log(`         hidden[${h.layer}]: ${maskSecrets(h.text).slice(0, 160)}`);
  }
  const n = (v: string) => results.filter((x) => x.r.verdict === v).length;
  console.log(`\n${files.length} files · ${n("block")} block · ${n("review")} review · ${n("allow")} allow`);
}
process.exit(results.some((x) => x.r.verdict === "block") ? 2 : results.some((x) => x.r.verdict === "review") ? 1 : 0);
