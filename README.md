# YUSA

**What you read is not what your agent reads.**

YUSA is a prompt-injection firewall for AI agents. It reads text the way a model reads it, finds the instructions hidden from people, and stops a hijacked agent before it acts.

Live demo: https://yusasecurity.xyz · X: [@yusasecurity](https://x.com/yusasecurity)

## What it does

| Layer | |
|---|---|
| **Unmask** | Decodes Unicode TAG smuggling, base64 blobs, HTML comments and `display:none` text. Strips zero-width and bidi characters. Folds Cyrillic/Greek look-alikes and leetspeak back to Latin. |
| **Score** | 25 rules: instruction override, role hijack, prompt extraction, forged chat-template tokens, wallet drain and unlimited approvals, exfiltration beacons. 10 secret formats. A directive found in a hidden layer is always a block. |
| **Fence** | Wraps untrusted text in a tag with a random nonce per call, so the model can tell data from orders. |
| **Gate** | Checks every tool call before it runs: tool, recipient address, host, value cap, unlimited approvals, secrets in outbound arguments. Decodes raw transaction calldata too, so a spender or recipient hidden inside `data` (approve, transfer, setApprovalForAll, permit, multicall batches) is checked against the allowlist. Reads values in wei, hex, gwei or "5 ETH" (unreadable values block), blocks unlimited Permit / Permit2 signatures and blind `eth_sign`, and refuses ENS names or bare hex where an address belongs. |

The engine (`src/engine/`) has no dependencies and no network access. It runs in the browser, in Node, as a CLI, and as an MCP server.

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

## MCP server

`mcp/yusa-mcp.mjs` gives any MCP client (Claude, Cursor, VS Code, ChatGPT desktop) three tools. One file, no dependencies, no network, stdio only.

| Tool | Call it | Returns |
|---|---|---|
| `yusa_scan` | on any text from outside the conversation, before acting on it | `allow` / `review` / `block`, findings, decoded hidden text (secrets masked) |
| `yusa_fence` | before putting that text into a prompt | the text in a random-nonce tag, invisible characters stripped |
| `yusa_check_tool_call` | before any call that moves value or sends data out, including raw transactions with `data` calldata | `allow` / `review` / `block` with reasons |

Listed in the [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.yusasecurity/yusa) as `io.github.yusasecurity/yusa`. For Claude Desktop, download [`yusa.mcpb`](https://github.com/yusasecurity/yusa/releases/latest/download/yusa.mcpb) and open it. Or run it straight from a clone:

```bash
git clone https://github.com/yusasecurity/yusa
claude mcp add yusa -- node /path/to/yusa/mcp/yusa-mcp.mjs
```

Other clients:

```json
{
  "mcpServers": {
    "yusa": {
      "command": "node",
      "args": ["/path/to/yusa/mcp/yusa-mcp.mjs"],
      "env": { "YUSA_POLICY": "/path/to/policy.json" }
    }
  }
}
```

`YUSA_POLICY` is optional and only used by `yusa_check_tool_call`. Without it, every call must pass its own `policy`, and a call with neither is blocked.

```json
{
  "allowTools": ["swap", "get_price"],
  "allowAddresses": ["0x1111111111111111111111111111111111111111"],
  "allowHosts": ["api.dexscreener.com"],
  "maxValueEth": 0.05
}
```

The tools are advisory: the model decides whether to call them. For a hard stop, call `checkToolCall` in your own code before the tool runs.

## GitHub Action

Fails a pull request that adds hidden or obfuscated instructions to anything an agent reads: prompts, `SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, docs. Findings show up as annotations on the changed lines and in the job summary, with secrets masked.

```yaml
# .github/workflows/yusa.yml
on: [pull_request]
permissions:
  contents: read
jobs:
  yusa:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: yusasecurity/yusa@v0.3.5
```

| Input | Default | |
|---|---|---|
| `paths` | `.` | files or directories to scan |
| `extensions` | `md,mdc,mdx,txt,prompt` | `AGENTS`, `CLAUDE`, `.cursorrules`, `.windsurfrules`, `.clinerules` are always included |
| `changed-only` | `true` | on PRs and pushes, scan only changed files |
| `exclude` | | path prefixes to skip, e.g. test fixtures that contain attacks on purpose |
| `mode` | `skill` | `skill` treats quoted and code-fenced text as a mention; `input` counts every line |
| `fail-on` | `block` | `block`, `review` or `never` |

Outputs: `blocked`, `review`, `scanned`. Runs on the runner's Node, no install step, no network, no token.

## Aeon skill pack

`skills/yusa-skill-audit` scans every `SKILL.md`, `soul/` and `STRATEGY.md` in an [Aeon](https://www.aeon.fun) instance for hidden or obfuscated injection, and alerts only on new or changed hits. Keyless, read-only, no network. `yusa.mjs` is the engine bundled into one 15 KB file.

Why it exists: a `SKILL.md` that hides an order in Unicode TAG characters renders as a harmless summary on GitHub and passes Aeon's install-time `scripts/skill-scan.sh`. YUSA blocks it with score 100 and shows the hidden text. Across 121 real upstream and community skill files it reports 0 blocks and 10 reviews.

## Develop

```bash
npm install
npm test               # engine tests
npm run build          # site -> dist/
npm run build:skill    # rebuild skills/yusa-skill-audit/yusa.mjs
npm run build:mcp      # rebuild mcp/yusa-mcp.mjs
```

## Benchmark

Scored on three public datasets. Rules were tuned on train splits only (deepset and Gandalf). Every number below is a test split that was never used for tuning. "Detected" means the verdict was review or block.

| test set | detection | false positives | precision |
|---|---|---|---|
| [deepset/prompt-injections](https://huggingface.co/datasets/deepset/prompt-injections) (Apache-2.0, EN + DE) | 35.0% (21/60) | 0.0% (0/56) | 100% |
| [`jackhhao/jailbreak-classification`](https://huggingface.co/datasets/jackhhao/jailbreak-classification) (Apache-2.0) | 69.1% (96/139) | 0.8% (1/123) | 99.0% |
| [Lakera/gandalf_ignore_instructions](https://huggingface.co/datasets/Lakera/gandalf_ignore_instructions) (MIT, injections only) | 72.3% (81/112) | n/a | n/a |

The jailbreak set was never tuned on at all. For comparison, train-split detection: deepset 50.2%, Gandalf 70.0%.

Reproduce with `npm run bench`. YUSA is tuned to avoid false positives, so it misses more than it flags wrongly. Most misses are roleplay setups ("two actors in a film about a robbery") and plain task requests ("generate SQL code") that the dataset labels as injections. Patterns cannot tell those apart from normal use, so the Gate's policy checks are the backstop.

## Limits

Detection is rule-based. A new phrasing can get past it, so a clean scan means no known pattern, not proof of safety. Use the Gate on anything that moves value.

## Credits

3D button adapted from [evil-buttons](https://github.com/radiumcoders/evil-buttons) (Apache-2.0).

## License

MIT
