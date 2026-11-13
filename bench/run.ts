import { readFileSync } from "node:fs";
import { scan } from "../src/engine/scan.ts";

// Usage: node bench/run.ts <rows.jsonl> [--show-misses N] [--show-fp N]
// Each line: {"text": string, "label": 0|1}. "flagged" = verdict review or block.
const [file, ...rest] = process.argv.slice(2);
const opt = (k: string) => {
  const i = rest.indexOf(k);
  return i >= 0 ? Number(rest[i + 1]) : 0;
};
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { text: string; label: number });

let tp = 0, fp = 0, tn = 0, fn = 0, blocks = 0;
const misses: string[] = [];
const fps: string[] = [];
for (const r of rows) {
  const v = scan(r.text).verdict;
  const flagged = v !== "allow";
  if (v === "block") blocks++;
  if (r.label === 1 && flagged) tp++;
  else if (r.label === 1) { fn++; misses.push(r.text); }
  else if (flagged) { fp++; fps.push(r.text); }
  else tn++;
}
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : "0.0") + "%";
const precision = tp + fp ? tp / (tp + fp) : 0;
const recall = tp + fn ? tp / (tp + fn) : 0;
console.log(`${file}: ${rows.length} rows, ${tp + fn} injections`);
console.log(`  detection (recall)   ${pct(tp, tp + fn)}  (${tp}/${tp + fn})`);
console.log(`  false positive rate  ${pct(fp, fp + tn)}  (${fp}/${fp + tn})`);
console.log(`  precision            ${(precision * 100).toFixed(1)}%   F1 ${((2 * precision * recall) / (precision + recall || 1)).toFixed(3)}   blocks ${blocks}`);
for (const m of misses.slice(0, opt("--show-misses"))) console.log("  MISS", m.slice(0, 140).replace(/\n/g, " "));
for (const m of fps.slice(0, opt("--show-fp"))) console.log("  FP  ", m.slice(0, 140).replace(/\n/g, " "));
