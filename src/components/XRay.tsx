import { CONFUSABLE } from "../engine/normalize.ts";
import { cn } from "../lib/cn.ts";

const ZW = /[\u200B-\u200D\u2060-\u2064\uFEFF\u00AD\u180E]/;
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/;

type Run = { kind: "plain" | "tag" | "zw" | "bidi" | "homo"; text: string; real?: string };

function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let r: Run;
    if (cp >= 0xe0000 && cp <= 0xe007f) r = { kind: "tag", text: cp - 0xe0000 >= 0x20 ? String.fromCharCode(cp - 0xe0000) : "" };
    else if (ZW.test(ch)) r = { kind: "zw", text: "" };
    else if (BIDI.test(ch)) r = { kind: "bidi", text: "" };
    else if (CONFUSABLE[ch]) r = { kind: "homo", text: ch, real: CONFUSABLE[ch] };
    else r = { kind: "plain", text: ch };
    const last = out[out.length - 1];
    if (last && last.kind === r.kind && (r.kind === "plain" || r.kind === "tag")) last.text += r.text;
    else out.push(r);
  }
  return out;
}

/** Renders text the way the model sees it: smuggled, invisible and look-alike characters made visible. */
export function XRay({ text, on, className }: { text: string; on: boolean; className?: string }) {
  if (!on) return <p className={cn("whitespace-pre-wrap break-words", className)}>{text}</p>;
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {runs(text).map((r, i) => {
        switch (r.kind) {
          case "plain":
            return <span key={i}>{r.text}</span>;
          case "tag":
            return (
              <mark key={i} className="bg-signal px-0.5 text-ink [box-decoration-break:clone]" title="Unicode TAG characters: invisible on screen, read by the model">
                {r.text}
              </mark>
            );
          case "zw":
            return <span key={i} className="mx-px inline-block h-[1.05em] w-[3px] translate-y-[0.15em] bg-signal" title="zero-width character" />;
          case "bidi":
            return <span key={i} className="mx-px inline-block rounded-[2px] bg-signal px-0.5 align-middle font-mono text-[9px] leading-none text-ink" title="bidi override">BIDI</span>;
          case "homo":
            return (
              <span key={i} className="relative text-signal underline decoration-2 underline-offset-4" title={`not Latin "${r.real}" — look-alike U+${r.text.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`}>
                {r.text}
              </span>
            );
        }
      })}
    </p>
  );
}
