import { readFileSync } from "node:fs";
import { scan } from "./engine/scan.ts";

// Usage: node src/cli.ts "<text>" | node src/cli.ts -f file | echo text | node src/cli.ts
const args = process.argv.slice(2);
const text = args[0] === "-f" ? readFileSync(args[1], "utf8") : args.length ? args.join(" ") : readFileSync(0, "utf8");
const r = scan(text);

if (process.stdout.isTTY) {
  const color = { allow: "\x1b[32m", review: "\x1b[33m", block: "\x1b[31m" }[r.verdict];
  console.log(`${color}${r.verdict.toUpperCase()}\x1b[0m  score ${r.score}/100  ${r.ms.toFixed(2)}ms`);
  for (const f of r.findings) console.log(`  ${f.id.padEnd(13)} ${f.layer.padEnd(13)} +${f.weight}  ${f.why}  «${f.match}»`);
  for (const h of r.hiddenText) console.log(`  hidden[${h.layer}]: ${h.text.slice(0, 160)}`);
} else {
  console.log(JSON.stringify(r));
}
process.exit(r.verdict === "block" ? 2 : r.verdict === "review" ? 1 : 0);
