import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, extname, join, relative } from "node:path";
import { maskSecrets, scan, type ScanResult, type Verdict } from "./engine/scan.ts";

// GitHub Action entry. Inputs arrive as env (set in action.yml), never interpolated into a shell.
const env = (k: string, d = "") => (process.env[k] ?? d).trim();

const ROOT = env("GITHUB_WORKSPACE", process.cwd());
const PATHS = env("INPUT_PATHS", ".").split(/[\s,]+/).filter(Boolean);
const EXTS = new Set(env("INPUT_EXTENSIONS", "md,mdc,mdx,txt,prompt").split(/[\s,]+/).filter(Boolean).map((e) => "." + e.replace(/^\./, "").toLowerCase()));
const NAMES = new Set([".cursorrules", ".windsurfrules", ".clinerules", "AGENTS", "CLAUDE"]);
const MODE = env("INPUT_MODE", "skill") === "input" ? "input" : "skill";
const FAIL_ON = (["block", "review", "never"].includes(env("INPUT_FAIL-ON")) ? env("INPUT_FAIL-ON") : "block") as "block" | "review" | "never";
const CHANGED_ONLY = env("INPUT_CHANGED-ONLY", "true") !== "false";
const MAX_BYTES = 2_000_000;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "vendor", ".next"]);

function wanted(file: string): boolean {
  const b = basename(file);
  return EXTS.has(extname(b).toLowerCase()) || NAMES.has(b);
}

function walk(p: string, out: string[]) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(basename(p))) return;
    for (const e of readdirSync(p)) walk(join(p, e), out);
  } else if (st.isFile() && wanted(p) && st.size <= MAX_BYTES) out.push(p);
}

function git(args: string[]): string {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** Files changed by this PR or push, or null when that can't be worked out (then scan everything). */
function changedFiles(): string[] | null {
  const path = env("GITHUB_EVENT_PATH");
  if (!path || !existsSync(path)) return null;
  const ev = JSON.parse(readFileSync(path, "utf8"));
  const base: string | undefined = ev.pull_request?.base?.sha ?? (ev.before && !/^0+$/.test(ev.before) ? ev.before : undefined);
  const head: string | undefined = ev.pull_request?.head?.sha ?? ev.after;
  if (!base || !head || !/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) return null;
  try {
    try {
      git(["cat-file", "-e", `${base}^{commit}`]);
    } catch {
      git(["fetch", "--no-tags", "--depth=1", "origin", base]);
    }
    return git(["diff", "--name-only", "--diff-filter=ACMR", "-z", base, head]).split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

/** First line that produces each finding on its own; 1 when the finding only appears across lines. */
function findingLines(text: string, r: ScanResult): Map<string, number> {
  const out = new Map<string, number>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.size < r.findings.length; i++) {
    if (!lines[i].trim()) continue;
    for (const f of scan(lines[i], { mode: MODE }).findings) {
      const k = f.id + f.layer;
      if (!out.has(k)) out.set(k, i + 1);
    }
  }
  return out;
}

const escData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s: string) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
const cell = (s: string) => s.replace(/[|`\r\n]/g, " ").slice(0, 160);

const changed = CHANGED_ONLY ? changedFiles() : null;
const all: string[] = [];
for (const p of PATHS) walk(join(ROOT, p), all);
const files = [...new Set(all)]
  .map((f) => relative(ROOT, f))
  .filter((f) => !f.startsWith(".."))
  .filter((f) => !changed || changed.includes(f))
  .sort();

const rows: { file: string; r: ScanResult; lines: Map<string, number> }[] = [];
for (const file of files) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const r = scan(text, { mode: MODE });
  if (r.verdict !== "allow") rows.push({ file, r, lines: findingLines(text, r) });
}

for (const { file, r, lines } of rows) {
  const level = r.verdict === "block" ? "error" : "warning";
  for (const f of r.findings) {
    const line = lines.get(f.id + f.layer) ?? 1;
    const hidden = f.layer !== "visible" ? ` [${f.layer}]` : "";
    console.log(`::${level} file=${escProp(file)},line=${line},title=${escProp(`YUSA ${f.id}`)}::${escData(`${f.why}${hidden}: ${maskSecrets(f.match)}`)}`);
  }
}

const count = (v: Verdict) => rows.filter((x) => x.r.verdict === v).length;
const blocked = count("block");
const reviewed = count("review");
const scope = changed ? "changed files" : "all files";
console.log(`YUSA: ${files.length} ${scope} scanned · ${blocked} block · ${reviewed} review · ${files.length - blocked - reviewed} allow`);

const summary = env("GITHUB_STEP_SUMMARY");
if (summary) {
  const md = [`### YUSA prompt-injection scan`, "", `${files.length} ${scope} scanned · **${blocked} block** · ${reviewed} review`, ""];
  if (rows.length) {
    md.push("| Verdict | File | Findings | Hidden text |", "|---|---|---|---|");
    for (const { file, r } of rows) {
      const hidden = r.hiddenText.map((h) => `${h.layer}: ${cell(maskSecrets(h.text))}`).join("<br>") || "-";
      md.push(`| ${r.verdict.toUpperCase()} | \`${cell(file)}\` | ${r.findings.map((f) => f.id).join(", ")} | ${hidden} |`);
    }
  } else md.push("No injection markers found.");
  appendFileSync(summary, md.join("\n") + "\n");
}

const out = env("GITHUB_OUTPUT");
if (out) appendFileSync(out, `blocked=${blocked}\nreview=${reviewed}\nscanned=${files.length}\n`);

const fail = FAIL_ON === "never" ? false : FAIL_ON === "review" ? blocked + reviewed > 0 : blocked > 0;
process.exit(fail ? 1 : 0);
