import { scan, type Verdict } from "./scan.ts";

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface Policy {
  allowTools: string[];
  /** Lowercased 0x addresses the agent may send value / approvals to. */
  allowAddresses: string[];
  /** Hostnames the agent may fetch / post to. */
  allowHosts: string[];
  maxValueEth: number;
}

export interface PolicyResult {
  verdict: Verdict;
  reasons: string[];
}

const MAX_UINT_PREFIX = "115792089237316195423570985008687907853269984665640564039457";

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

export function checkToolCall(call: ToolCall, policy: Policy): PolicyResult {
  const reasons: string[] = [];
  let verdict: Verdict = "allow";
  const bump = (v: Verdict, r: string) => {
    reasons.push(r);
    if (v === "block" || (v === "review" && verdict === "allow")) verdict = v;
  };

  if (!policy.allowTools.includes(call.tool)) bump("block", `tool "${call.tool}" not in allowlist`);

  const all = strings(call.args);
  const allowAddr = new Set(policy.allowAddresses.map((a) => a.toLowerCase()));
  for (const a of new Set(all.flatMap((s) => s.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []))) {
    if (!allowAddr.has(a.toLowerCase())) bump("block", `address ${a.slice(0, 8)}…${a.slice(-4)} not in allowlist`);
  }

  for (const s of all) {
    for (const m of s.matchAll(/https?:\/\/([^/\s:?#]+)/g)) {
      const host = m[1].toLowerCase();
      if (!policy.allowHosts.some((h) => host === h || host.endsWith("." + h))) bump("block", `host ${host} not in allowlist`);
    }
  }

  const value = Number(call.args.valueEth ?? call.args.value ?? 0);
  if (Number.isFinite(value) && value > policy.maxValueEth) bump("block", `value ${value} ETH > cap ${policy.maxValueEth}`);

  const amount = String(call.args.amount ?? "");
  if (amount.startsWith(MAX_UINT_PREFIX) || /^(?:max|unlimited|infinite)$/i.test(amount)) bump("block", "unlimited approval amount");

  // Outbound args are where a hijacked agent leaks things; scan them like untrusted input.
  const out = scan(all.join("\n"));
  for (const f of out.findings) {
    if (f.category === "secret") bump("block", `outbound ${f.why}`);
    else if (f.category === "exfiltration") bump("block", `outbound ${f.why}`);
  }

  return { verdict, reasons };
}
