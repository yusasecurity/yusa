export type Layer = "visible" | "tag-smuggled" | "vs-smuggled" | "base64" | "html-hidden";

export interface Unmasked {
  layers: { layer: Layer; text: string }[];
  invisibleCount: number;
  bidiCount: number;
  tagCount: number;
  /** Longest run of variation selectors (2+ can carry bytes). */
  vsRun: number;
  mixedScriptWords: string[];
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060-\u2064\uFEFF\u00AD\u180E]/g;
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;
const TAG = /[\u{E0000}-\u{E007F}]/gu;
// Variation selectors. Emoji smuggling maps each byte to one: 0-15 -> U+FE00-FE0F, 16-255 -> U+E0100-E01EF.
const VS_RUN = /(?:[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]){2,}/gu;
const VS_SUPP = /[\u{E0100}-\u{E01EF}]/gu;

export const CONFUSABLE: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
  "ԁ": "d", "һ": "h", "ӏ": "l", "ԛ": "q", "ԝ": "w", "ɡ": "g",
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "ι": "i", "ν": "v", "τ": "t", "κ": "k", "υ": "u", "χ": "x",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

const LATIN = /[a-z]/i;
const NON_LATIN_LETTER = /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F]/;

export function decodeTags(s: string): string {
  let out = "";
  for (const ch of s.matchAll(TAG)) {
    const cp = ch[0].codePointAt(0)! - 0xe0000;
    if (cp >= 0x20 && cp < 0x7f) out += String.fromCharCode(cp);
  }
  return out;
}

export function decodeVariationSelectors(s: string): string {
  const out: string[] = [];
  for (const run of s.matchAll(VS_RUN)) {
    const bytes = Array.from(run[0], (c) => {
      const cp = c.codePointAt(0)!;
      return cp <= 0xfe0f ? cp - 0xfe00 : cp - 0xe0100 + 16;
    });
    const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes)).replace(/[^\x20-\x7e\n\t\u00a0-\uffff]/g, "");
    if (text.trim()) out.push(text);
  }
  return out.join("\n");
}

/** Canonical form the rules match against: NFKC, invisibles stripped, confusables folded, lowercase. */
export function canon(s: string): string {
  let t = s.normalize("NFKC").replace(ZERO_WIDTH, "").replace(BIDI, "").replace(TAG, "").replace(VS_SUPP, "");
  t = Array.from(t, (c) => CONFUSABLE[c] ?? c).join("").toLowerCase();
  // "i g n o r e" / "i.g.n.o.r.e" spacing evasion
  t = t.replace(/\b(?:[a-z][\s._\-*]){3,}[a-z]\b/g, (m) => m.replace(/[\s._\-*]/g, ""));
  return t.replace(/\s+/g, " ");
}

export function deleet(s: string): string {
  return s.replace(/(?<=[a-z])[013457@$]|[013457@$](?=[a-z])/g, (c) => LEET[c] ?? c);
}

function decodeBase64Blobs(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) {
    try {
      const raw = atob(m[0]);
      const printable = raw.replace(/[^\x20-\x7e\n\r\t]/g, "");
      if (printable.length >= raw.length * 0.9 && /[a-z]{3,}\s+[a-z]{2,}/i.test(printable)) out.push(printable);
    } catch {
      /* not base64 */
    }
  }
  return out;
}

function htmlHidden(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/<!--([\s\S]*?)-->/g)) out.push(m[1]);
  const hiddenStyle = /<(\w+)[^>]*style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0(?:\.0+)?\b|color\s*:\s*(?:#fff(?:fff)?|white|transparent))[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of s.matchAll(hiddenStyle)) out.push(m[3]);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function unmask(input: string): Unmasked {
  const layers: Unmasked["layers"] = [{ layer: "visible", text: input }];
  const tagText = decodeTags(input);
  if (tagText) layers.push({ layer: "tag-smuggled", text: tagText });
  const vsText = decodeVariationSelectors(input);
  if (vsText) layers.push({ layer: "vs-smuggled", text: vsText });
  for (const t of htmlHidden(input)) layers.push({ layer: "html-hidden", text: t });
  for (const t of decodeBase64Blobs(input)) layers.push({ layer: "base64", text: t });

  // Only count look-alikes; Δ or θ in a formula is not an attack.
  const mixedScriptWords = [...new Set(
    input.normalize("NFKC").split(/[^\p{L}]+/u).filter((w) => w.length > 2 && LATIN.test(w) && NON_LATIN_LETTER.test(w) && [...w].some((c) => c in CONFUSABLE)),
  )];

  return {
    layers,
    invisibleCount: (input.match(ZERO_WIDTH) ?? []).length,
    bidiCount: (input.match(BIDI) ?? []).length,
    tagCount: (input.match(TAG) ?? []).length,
    vsRun: Math.max(0, ...Array.from(input.matchAll(VS_RUN), (m) => [...m[0]].length)),
    mixedScriptWords,
  };
}
