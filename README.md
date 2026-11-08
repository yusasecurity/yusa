# YUSA

**What you read is not what your agent reads.**

YUSA is a prompt-injection firewall for AI agents. It reads text the way a model reads it, finds the instructions hidden from people, and stops a hijacked agent before it acts.

Live demo: https://yusa-two.vercel.app

## What it does

| Layer | |
|---|---|
| **Unmask** | Decodes Unicode TAG smuggling, base64 blobs, HTML comments and `display:none` text. Strips zero-width and bidi characters. Folds Cyrillic/Greek look-alikes and leetspeak back to Latin. |
| **Score** | 25 rules: instruction override, role hijack, prompt extraction, forged chat-template tokens, wallet drain and unlimited approvals, exfiltration beacons. 10 secret formats. A directive found in a hidden layer is always a block. |
| **Fence** | Wraps untrusted text in a tag with a random nonce per call, so the model can tell data from orders. |
| **Gate** | Checks every tool call before it runs: tool, recipient address, host, value cap, unlimited approvals, secrets in outbound arguments. |

The engine (`src/engine/`) has no dependencies and no network access. It runs in the browser, in Node, and as a CLI.

## Use

```ts
import { scan, fence } from "./src/engine/scan.ts";
import { checkToolCall } from "./src/engine/policy.ts";

const r = scan(page);
if (r.verdict === "block") return refuse(r.findings);
prompt += fence(page, "web");

const g = checkToolCall({ tool, args }, policy);
if (g.verdict !== "allow") return askOwner(g.reasons);
```

```bash
node src/cli.ts -f page.html      # exit 0 allow · 1 review · 2 block
curl -s $URL | node src/cli.ts
```

## Aeon skill pack

`skills/yusa-skill-audit` scans every `SKILL.md`, `soul/` and `STRATEGY.md` in an [Aeon](https://www.aeon.fun) instance for hidden or obfuscated injection, and alerts only on new or changed hits. Keyless, read-only, no network. `yusa.mjs` is the engine bundled into one 15 KB file.

Why it exists: a `SKILL.md` that hides an order in Unicode TAG characters renders as a harmless summary on GitHub and passes Aeon's install-time `scripts/skill-scan.sh`. YUSA blocks it with score 100 and shows the hidden text. Across 121 real upstream and community skill files it reports 0 blocks and 10 reviews.

## Develop

```bash
npm install
npm test               # engine tests
npm run build          # site -> dist/
npm run build:skill    # rebuild skills/yusa-skill-audit/yusa.mjs
node scripts/brand.mjs && node scripts/banner.mjs   # logo, avatar, banner, OG
```

## Limits

Detection is rule-based. A new phrasing can get past it, so a clean scan means no known pattern, not proof of safety. Use the Gate on anything that moves value.

## Credits

3D button adapted from [evil-buttons](https://github.com/radiumcoders/evil-buttons) (Apache-2.0).

## License

MIT
