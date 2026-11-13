import { useEffect, useState } from "react";

type Token = { live: boolean; ticker: string; ca: string; chart?: string; buy?: string };

const isCa = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);
const isHttps = (s?: string) => !!s && s.startsWith("https://");

/** Shown only when public/token.json says live and the CA is well-formed. */
export function CaBar() {
  const [t, setT] = useState<Token | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`./token.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Token | null) => d && d.live && isCa(d.ca) && setT(d))
      .catch(() => {});
  }, []);

  if (!t) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(t.ca).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border border-rule bg-coal px-4 py-3 font-mono text-xs">
      <span className="text-signal">${t.ticker}</span>
      <span className="text-ash">CA</span>
      <button onClick={copy} className="max-w-[18rem] truncate text-bone hover:text-signal" title="Copy contract address">
        {t.ca}
      </button>
      <span className="text-ash">{copied ? "copied" : "click to copy"}</span>
      {isHttps(t.chart) && (
        <a href={t.chart} target="_blank" rel="noopener noreferrer" className="text-ash hover:text-bone">chart</a>
      )}
      {isHttps(t.buy) && (
        <a href={t.buy} target="_blank" rel="noopener noreferrer" className="text-ash hover:text-bone">buy</a>
      )}
      <span className="basis-full text-[11px] text-ash">
        Community token. YUSA stays free and open source; holding it is not needed to use anything here.
      </span>
    </div>
  );
}
