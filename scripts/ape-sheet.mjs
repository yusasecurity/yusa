import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const B = "#f1ede4", K = "#0c0c0b", O = "#ff4d00";

// Each concept is the inner markup of a 64x64 viewBox.
export const APES = {
  // A: face mask is the Y; orange square eyes sit in the Y's arms
  mask: `
    <circle cx="8" cy="32" r="7" fill="${B}"/><circle cx="56" cy="32" r="7" fill="${B}"/>
    <circle cx="8" cy="32" r="3" fill="${K}"/><circle cx="56" cy="32" r="3" fill="${K}"/>
    <rect x="11" y="6" width="42" height="54" rx="19" fill="${B}"/>
    <path d="M17 18h12l3 7 3-7h12v14c0 4-3 6-6 7v4c5 1 8 5 8 9 0 5-5 8-17 8s-17-3-17-8c0-4 3-8 8-9v-4c-3-1-6-3-6-7z" fill="${K}"/>
    <rect x="20" y="24" width="7" height="7" fill="${O}"/><rect x="37" y="24" width="7" height="7" fill="${O}"/>
    <rect x="28" y="46" width="2.5" height="3" fill="${B}"/><rect x="33.5" y="46" width="2.5" height="3" fill="${B}"/>`,

  // B: ape with an orange visor bar: it reads the layer you can't see
  visor: `
    <rect x="1" y="26" width="12" height="14" rx="6" fill="${B}"/><rect x="51" y="26" width="12" height="14" rx="6" fill="${B}"/>
    <path d="M10 22c0-10 10-16 22-16s22 6 22 16v20c0 10-9 18-22 18s-22-8-22-18z" fill="${B}"/>
    <path d="M18 24c3-4 8-5 14-2 6-3 11-2 14 2v6c0 3 2 5 2 9 0 8-7 13-16 13s-16-5-16-13c0-4 2-6 2-9z" fill="${K}"/>
    <rect x="6" y="26" width="52" height="8" fill="${O}"/>
    <rect x="27" y="41" width="3" height="3" fill="${B}"/><rect x="34" y="41" width="3" height="3" fill="${B}"/>
    <rect x="25" y="48" width="14" height="2" fill="${B}"/>`,

  // C: "sees no evil" inverted: hands over the eyes, one orange eye peeking through the gap
  peek: `
    <circle cx="8" cy="30" r="7" fill="${B}"/><circle cx="56" cy="30" r="7" fill="${B}"/>
    <rect x="11" y="6" width="42" height="54" rx="19" fill="${B}"/>
    <path d="M20 38c0 8 5 14 12 14s12-6 12-14z" fill="${K}"/>
    <rect x="28" y="43" width="2.5" height="3" fill="${B}"/><rect x="33.5" y="43" width="2.5" height="3" fill="${B}"/>
    <path d="M4 20h24l2 12H6c-2 0-3-2-3-4z" fill="${K}"/><path d="M60 20H36l-2 12h24c2 0 3-2 3-4z" fill="${K}"/>
    <path d="M6 23h20M6 27h20M38 23h20M38 27h20" stroke="${B}" stroke-width="1.2"/>
    <rect x="29.5" y="23" width="5" height="7" fill="${O}"/>`,

  // D: pixel ape on an 8x8 grid, orange eyes, reads as a sprite at 16px
  pixel: (() => {
    const g = [
      "..XXXX..",
      ".XXXXXX.",
      "XXkkkkXX",
      "XkOkkOkX",
      ".Xkkkkx.",
      "..kkkk..",
      "..kXXk..",
      "...kk...",
    ];
    const col = { X: B, k: K, O: O, x: B };
    let s = "";
    g.forEach((row, y) => [...row].forEach((c, x) => { if (col[c]) s += `<rect x="${x * 8}" y="${y * 8}" width="8.2" height="8.2" fill="${col[c]}"/>`; }));
    return s;
  })(),
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = Object.keys(APES);
  const cell = 300, pad = 40;
  const w = names.length * cell, h = cell * 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${K}"/>`;
  names.forEach((n, i) => {
    svg += `<svg x="${i * cell + pad}" y="${pad}" width="${cell - 2 * pad}" height="${cell - 2 * pad}" viewBox="0 0 64 64">${APES[n]}</svg>`;
    [64, 32, 16].forEach((s, j) => {
      svg += `<svg x="${i * cell + pad + [0, 90, 140][j]}" y="${cell + 60}" width="${s}" height="${s}" viewBox="0 0 64 64">${APES[n]}</svg>`;
    });
    svg += `<circle cx="${i * cell + cell / 2}" cy="${cell + 200}" r="50" fill="${K}" stroke="#2a2a27"/>`;
    svg += `<svg x="${i * cell + cell / 2 - 36}" y="${cell + 164}" width="72" height="72" viewBox="0 0 64 64">${APES[n]}</svg>`;
  });
  svg += `</svg>`;
  writeFileSync(new URL("../ape-sheet.png", import.meta.url), new Resvg(svg).render().asPng());
  console.log(names.join(" | "));
}
