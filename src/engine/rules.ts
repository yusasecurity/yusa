export type Category =
  | "override"
  | "role-hijack"
  | "prompt-leak"
  | "fake-delimiter"
  | "action-hijack"
  | "exfiltration"
  | "secret"
  | "obfuscation";

export interface Rule {
  id: string;
  category: Category;
  weight: number;
  re: RegExp;
  why: string;
}

const V_IGNORE = "(?:ignore|disregard|forget|override|bypass|skip|abandon|drop|abaikan|lupakan)";
const PRIOR = "(?:all |any |the |your |these |those |semua |)?(?:previous|prior|above|earlier|preceding|original|initial|existing|system|developer|sebelumnya)";
const RULESET = "(?:instructions?|prompts?|rules?|directives?|guidelines?|context|messages?|constraints?|guardrails?|policies|instruksi|perintah|aturan)";

export const RULES: Rule[] = [
  // override
  { id: "OVR-001", category: "override", weight: 60, re: new RegExp(`${V_IGNORE}\\s+${PRIOR}\\s*${RULESET}`), why: "Tells the agent to drop its existing instructions" },
  { id: "OVR-002", category: "override", weight: 40, re: new RegExp(`${V_IGNORE}\\s+(?:everything|anything|all)\\s+(?:you were|you've been|above|before)`), why: "Blanket instruction reset" },
  { id: "OVR-003", category: "override", weight: 35, re: /\b(?:new|updated|revised|real|actual|true)\s+(?:instructions?|system prompt|task|directive|orders?)\s*(?:are|is|:|follow)/, why: "Claims to replace the agent's real task" },
  { id: "OVR-004", category: "override", weight: 30, re: /\bfrom now on\b.{0,40}\b(?:you (?:will|must|are|shall)|always|never|only)\b/, why: "Persistent behaviour rewrite" },
  { id: "OVR-005", category: "override", weight: 25, re: /\b(?:do not|don't|never) (?:tell|inform|alert|notify|mention (?:this )?to) (?:the )?(?:user|owner|human|operator)\b/, why: "Asks the agent to hide actions from its owner" },

  // role hijack / jailbreak
  { id: "ROLE-001", category: "role-hijack", weight: 35, re: /\byou are (?:now|no longer)\b/, why: "Reassigns the agent's identity" },
  { id: "ROLE-002", category: "role-hijack", weight: 40, re: /\b(?:dan|developer mode|god mode|jailbreak(?:ed)?|unfiltered|uncensored|no restrictions|without (?:any )?(?:restrictions|limits|filters))\b/, why: "Known jailbreak persona / mode" },
  { id: "ROLE-003", category: "role-hijack", weight: 25, re: /\b(?:pretend|act as if|roleplay as|imagine) (?:you are|you're|to be)\b.{0,60}\b(?:no|without|free of|ignore)\b/, why: "Roleplay used to shed constraints" },
  { id: "ROLE-004", category: "role-hijack", weight: 30, re: /\b(?:i am|this is) (?:your|the) (?:developer|creator|admin(?:istrator)?|owner|operator|system)\b/, why: "Impersonates a privileged principal" },

  // prompt leak
  { id: "LEAK-001", category: "prompt-leak", weight: 35, re: /\b(?:reveal|print|show|repeat|output|dump|display|leak|tell me)\b.{0,30}\b(?:system prompt|initial prompt|hidden (?:prompt|instructions)|your (?:instructions|rules|prompt)|instructions above)\b/, why: "Attempts to extract the system prompt" },
  { id: "LEAK-002", category: "prompt-leak", weight: 30, re: /\b(?:repeat|print|output) (?:everything|all(?: the)? text|the words?) (?:above|before|preceding)\b/, why: "Classic 'repeat the above' extraction" },

  // fake delimiters / template tokens
  { id: "DLM-001", category: "fake-delimiter", weight: 45, re: /<\|(?:im_start|im_end|system|endoftext|eot_id|start_header_id|end_header_id)\|>/, why: "Chat-template control token in untrusted data" },
  { id: "DLM-002", category: "fake-delimiter", weight: 35, re: /(?:^|\n)\s*(?:#{1,3}\s*)?(?:system|assistant|developer)\s*(?:message|prompt)?\s*:\s*\S/, why: "Fake role header injected into content" },
  { id: "DLM-003", category: "fake-delimiter", weight: 35, re: /<\/?(?:system|instructions?|admin|sudo|tool_call|function_call)>|\[\/?(?:inst|system|sys)\]|<<\/?sys>>/, why: "Fake system/tool tag" },
  { id: "DLM-004", category: "fake-delimiter", weight: 20, re: /\b(?:end of (?:document|context|user input|data)|begin(?:ning)? (?:new|real) instructions)\b/, why: "Pretends the data section ended" },

  // action hijack (agent tools / wallets)
  { id: "ACT-001", category: "action-hijack", weight: 50, re: /\b(?:send|transfer|withdraw|bridge|move|sweep|drain|kirim)\b.{0,40}\b(?:all|entire|max|everything|full balance|semua)\b.{0,40}\b(?:to|ke)\b.{0,10}0x[0-9a-f]{40}/, why: "Instructs a full-balance transfer to an address" },
  { id: "ACT-002", category: "action-hijack", weight: 40, re: /\b(?:send|transfer|pay|withdraw|kirim)\b.{0,40}\b(?:to|ke)\b\s*0x[0-9a-f]{40}/, why: "Instructs a transfer to an embedded address" },
  { id: "ACT-003", category: "action-hijack", weight: 45, re: /\b(?:approve|setapprovalforall|increaseallowance|permit)\b.{0,40}\b(?:unlimited|max|infinite|uint256|2\^256|type\(uint256\)|115792089)/, why: "Unlimited token approval" },
  { id: "ACT-004", category: "action-hijack", weight: 40, re: /\b(?:sign|execute|call|run|invoke)\b.{0,30}\b(?:this|the following|attached)\b.{0,20}\b(?:transaction|tx|message|typed data|calldata|payload|command|tool)\b/, why: "Asks the agent to sign/execute provided payload" },
  { id: "ACT-005", category: "action-hijack", weight: 45, re: /\b(?:rm -rf|curl [^|\n]{0,80}\|\s*(?:sh|bash)|wget [^|\n]{0,80}\|\s*(?:sh|bash)|chmod \+x|eval\(|os\.system|subprocess|powershell -e)/, why: "Shell command / remote code execution" },
  { id: "ACT-006", category: "action-hijack", weight: 35, re: /\b(?:call|use|invoke|trigger)\b.{0,20}\b(?:tool|function)\b.{0,30}\b(?:with|args?|arguments?|parameters?)\b/, why: "Directs a specific tool invocation" },

  // exfiltration
  { id: "EXF-001", category: "exfiltration", weight: 45, re: /!\[[^\]]*\]\(https?:\/\/[^)\s]+\?[^)\s]*(?:\{|%7b|data|q|d|secret|key|token|prompt|history)=/, why: "Markdown image beacon that smuggles data in the URL" },
  { id: "EXF-002", category: "exfiltration", weight: 40, re: /\b(?:send|post|upload|forward|exfiltrate|leak|include|append)\b.{0,40}\b(?:private key|seed|mnemonic|api key|secret|password|credentials?|\.env|cookies?|session|conversation|chat history|system prompt)\b/, why: "Asks to ship secrets or history somewhere" },
  { id: "EXF-003", category: "exfiltration", weight: 30, re: /\b(?:webhook\.site|requestbin|pipedream\.net|ngrok(?:-free)?\.(?:app|io)|interact\.sh|oast\.(?:fun|me|pro|live|site)|burpcollaborator|canarytokens|discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)/, why: "Known data-collection endpoint" },

  // obfuscation phrasing
  { id: "OBF-001", category: "obfuscation", weight: 20, re: /\b(?:decode|base64 ?decode|rot13|reverse) (?:this|the following|and (?:follow|execute|run|obey))\b/, why: "Asks the agent to decode then obey" },
];

export interface SecretRule {
  id: string;
  label: string;
  re: RegExp;
  weight: number;
}

// Matched on raw (non-lowercased) text.
export const SECRETS: SecretRule[] = [
  // Bare 64-hex is indistinguishable from a tx hash, so require a key-ish label.
  { id: "SEC-EVMKEY", label: "EVM private key", weight: 60, re: /(?:priv(?:ate)?[_ -]?key|secret[_ -]?key|signer[_ -]?key|wallet[_ -]?key|\bpk)["']?\s*[:=]\s*["']?(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/gi },
  { id: "SEC-OPENAI", label: "OpenAI key", weight: 55, re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: "SEC-ANTHROPIC", label: "Anthropic key", weight: 55, re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: "SEC-GITHUB", label: "GitHub token", weight: 55, re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{30,}\b/g },
  { id: "SEC-AWS", label: "AWS access key", weight: 50, re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "SEC-TGBOT", label: "Telegram bot token", weight: 50, re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { id: "SEC-SLACK", label: "Slack token", weight: 50, re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: "SEC-JWT", label: "JWT", weight: 30, re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: "SEC-PEM", label: "PEM private key", weight: 60, re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
];
