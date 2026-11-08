import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const mark = readFileSync(new URL("../public/yusa-mark.svg", import.meta.url), "utf8");
const inner = mark.replace(/<svg[^>]*>|<\/svg>/g, "");
mkdirSync(new URL("../public/brand/", import.meta.url), { recursive: true });

const out = (name, svg, w) => {
  writeFileSync(new URL(`../public/brand/${name}`, import.meta.url), new Resvg(svg, { fitTo: { mode: "width", value: w } }).render().asPng());
  console.log(name);
};

// Mark centred on ink with breathing room (X crops avatars to a circle).
const padded = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 104 104"><rect x="-20" y="-20" width="104" height="104" fill="${bg}"/>${inner}</svg>`;

out("yusa-mark-1024.png", mark, 1024);
out("yusa-avatar-400.png", padded("#0c0c0b"), 400);
out("yusa-avatar-1024.png", padded("#0c0c0b"), 1024);
