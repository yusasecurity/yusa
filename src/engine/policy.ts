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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function objects(v: unknown, out: Obj[] = []): Obj[] {
  if (Array.isArray(v)) v.forEach((x) => objects(x, out));
  else if (isObj(v)) {
    out.push(v);
    Object.values(v).forEach((x) => objects(x, out));
  }
  return out;
}

const ADDRESS_KEY = /^(?:to|recipient|receiver|spender|operator|beneficiary|dst|destination|target|address)$/i;
const URL_KEY = /^(?:url|uri|href|link|endpoint|webhook|callback|host|server|baseurl)$/i;
const VALUE_KEY = /^(?:value|valueeth|valuewei|msgvalue)$/i;
const AMOUNT_KEY = /^(?:value|amount|allowance)$/i;
const UNLIMITED = 2n ** 120n;

/** Reads a native-coin amount in ETH. Hex and 10+ digit integers are wei; "5 eth", "3 gwei" take their unit. */
export function parseEth(v: unknown, key = "value"): number | null {
  const k = key.toLowerCase();
  if (typeof v === "bigint") return Number(v) / 1e18;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    return k === "valuewei" || (k !== "valueeth" && Number.isInteger(v) && v >= 1e9) ? v / 1e18 : v;
  }
  if (typeof v !== "string") return v === undefined || v === null ? 0 : null;
  const s = v.trim().toLowerCase();
  if (s === "") return 0;
  if (/^0x[0-9a-f]+$/.test(s)) return Number(BigInt(s)) / 1e18;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(eth|ether|gwei|wei)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? (k === "valueeth" ? "eth" : k === "valuewei" || (!m[1].includes(".") && m[1].length >= 10) ? "wei" : "eth");
  return unit === "wei" ? n / 1e18 : unit === "gwei" ? n / 1e9 : n;
}

function isUnlimited(v: unknown): boolean {
  if (typeof v === "string" && /^(?:max|unlimited|infinite)$/i.test(v.trim())) return true;
  try {
    return (typeof v === "string" || typeof v === "number" || typeof v === "bigint") && BigInt(v) >= UNLIMITED;
  } catch {
    return false;
  }
}

function hostOf(raw: string): string | null {
  const s = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[:/?#]|$)/i.test(s) ? "https://" + s : null;
  if (!withScheme) return null;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^\[|\]$/g, "") || null;
  } catch {
    return null;
  }
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
  const objs = objects(call.args);
  const allowAddr = new Set(policy.allowAddresses.map((a) => a.toLowerCase()));
  const addrs = new Set(all.flatMap((s) => s.match(/0x[0-9a-f]{40}(?![0-9a-f])/gi) ?? []).map((a) => "0x" + a.slice(2).toLowerCase()));

  for (const o of objs) {
    for (const [k, v] of Object.entries(o)) {
      if (!ADDRESS_KEY.test(k) || typeof v !== "string" || v.trim() === "") continue;
      const s = v.trim();
      if (/^(?:0x)?[0-9a-f]{40}$/i.test(s)) addrs.add("0x" + s.slice(-40).toLowerCase());
      else if (!URL_KEY.test(k) && !/^0x[0-9a-f]{40}/i.test(s)) bump("block", `${k} "${s.slice(0, 40)}" is not a 0x address; resolve names before the Gate`);
    }
  }

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

  const hosts = new Set<string>();
  for (const s of all) {
    for (const m of s.matchAll(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi)) {
      const h = hostOf(m[0]);
      if (h) hosts.add(h);
    }
  }
  for (const o of objs) {
    for (const [k, v] of Object.entries(o)) {
      if (URL_KEY.test(k) && typeof v === "string") {
        const h = hostOf(v);
        if (h) hosts.add(h);
      }
    }
  }
  for (const host of hosts) {
    if (!policy.allowHosts.some((h) => host === h || host.endsWith("." + h))) bump("block", `host ${host} not in allowlist`);
  }

  // Native value: top-level args, plus any nested object that looks like a transaction.
  const txLike = [call.args, ...objs.filter((o) => o !== call.args && typeof o.to === "string")];
  for (const o of txLike) {
    for (const [k, v] of Object.entries(o)) {
      if (!VALUE_KEY.test(k)) continue;
      const eth = parseEth(v, k);
      if (eth === null) bump("block", `${k} "${String(v).slice(0, 30)}" could not be read as an amount`);
      else if (eth > policy.maxValueEth) bump("block", `value ${+eth.toPrecision(6)} ETH > cap ${policy.maxValueEth}`);
    }
  }

  if (isUnlimited(call.args.amount) || String(call.args.amount ?? "").startsWith(MAX_UINT_PREFIX)) bump("block", "unlimited approval amount");

  // Typed-data signatures (EIP-712): Permit, Permit2 and similar grant allowances off-chain.
  for (const o of objs) {
    if (typeof o.primaryType !== "string" || !isObj(o.message)) continue;
    for (const m of objects(o.message)) {
      for (const [k, v] of Object.entries(m)) {
        if (AMOUNT_KEY.test(k) && isUnlimited(v)) bump("block", `signature ${o.primaryType}: unlimited ${k}`);
      }
    }
  }

  const method = String(call.args.method ?? call.tool).toLowerCase();
  if (method === "eth_sign") bump("block", "eth_sign signs a raw hash blind; use typed data instead");
  if (method === "personal_sign" && all.some((s) => /^0x[0-9a-f]{64}$/i.test(s.trim()))) bump("block", "personal_sign over a raw 32-byte hash is a blind signature");

  // Outbound args are where a hijacked agent leaks things; scan them like untrusted input.
  const out = scan(all.join("\n"));
  for (const f of out.findings) {
    if (f.category === "secret") bump("block", `outbound ${f.why}`);
    else if (f.category === "exfiltration") bump("block", `outbound ${f.why}`);
  }

  return { verdict, reasons };
}
