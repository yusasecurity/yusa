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

const SELECTORS: Record<string, string> = {
  "095ea7b3": "approve",
  "39509351": "increaseAllowance",
  "a9059cbb": "transfer",
  "23b872dd": "transferFrom",
  "a22cb465": "setApprovalForAll",
  "d505accf": "permit",
  "87517c45": "permit2Approve",
};

export interface DecodedCall {
  fn: string | null;
  addresses: string[];
  unlimited: boolean;
  approvalForAll: boolean;
}

/** Pulls addresses and risky approvals out of raw EVM calldata, including calls nested in multicall bytes. */
export function decodeCalldata(hex: string): DecodedCall | null {
  if (!/^0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{2})*$/.test(hex) || hex.length < 10 + 64) return null;
  const h = hex.slice(2).toLowerCase();
  const fn = SELECTORS[h.slice(0, 8)] ?? null;
  const word = (i: number) => h.slice(8 + i * 64, 8 + (i + 1) * 64);
  const addresses = new Set<string>();
  // Inner calls start 4 bytes past a 32-byte boundary, so check every 4-byte offset.
  // An address word has 12 zero bytes then a value >= 2^128; small amounts never qualify.
  // Misaligned windows straddle padding and end in zero bytes, which real addresses ~never do.
  for (let p = 8; p + 64 <= h.length; p += 8) {
    const w = h.slice(p, p + 64);
    if (w.startsWith("0".repeat(24)) && !w.startsWith("0".repeat(32)) && !w.endsWith("00000000")) addresses.add("0x" + w.slice(24));
  }
  const max = (w: string) => /^f{40,}$/.test(w.replace(/^0+/, ""));
  const unlimited =
    ((fn === "approve" || fn === "increaseAllowance") && max(word(1))) ||
    (fn === "permit" && max(word(2))) ||
    (fn === "permit2Approve" && max(word(2)));
  const approvalForAll = fn === "setApprovalForAll" && /[1-9a-f]/.test(word(1));
  return { fn, addresses: [...addresses], unlimited, approvalForAll };
}

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
  const addrs = new Set(all.flatMap((s) => s.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []).map((a) => a.toLowerCase()));

  for (const s of all) {
    const d = decodeCalldata(s.trim());
    if (!d) continue;
    d.addresses.forEach((a) => addrs.add(a));
    const name = d.fn ?? "unknown function";
    if (d.unlimited) bump("block", `calldata ${name}: unlimited approval`);
    if (d.approvalForAll) bump("block", "calldata setApprovalForAll: hands over every NFT in the collection");
    if (!d.fn && d.addresses.length === 0) bump("review", "calldata for an unknown function; decode it before signing");
  }

  for (const a of addrs) {
    if (!allowAddr.has(a)) bump("block", `address ${a.slice(0, 8)}…${a.slice(-4)} not in allowlist`);
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
