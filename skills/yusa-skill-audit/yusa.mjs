import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// src/engine/normalize.ts
const ZERO_WIDTH = /[\u200B-\u200D\u2060-\u2064\uFEFF\u00AD\u180E]/g;
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;
const TAG = /[\u{E0000}-\u{E007F}]/gu;
const VS_RUN = /(?:[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]){2,}/gu;
const VS_SUPP = /[\u{E0100}-\u{E01EF}]/gu;
const CONFUSABLE = {
	"а": "a",
	"е": "e",
	"о": "o",
	"р": "p",
	"с": "c",
	"у": "y",
	"х": "x",
	"і": "i",
	"ј": "j",
	"ѕ": "s",
	"ԁ": "d",
	"һ": "h",
	"ӏ": "l",
	"ԛ": "q",
	"ԝ": "w",
	"ɡ": "g",
	"α": "a",
	"ε": "e",
	"ο": "o",
	"ρ": "p",
	"ι": "i",
	"ν": "v",
	"τ": "t",
	"κ": "k",
	"υ": "u",
	"χ": "x"
};
const LEET = {
	"0": "o",
	"1": "i",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"@": "a",
	"$": "s"
};
const LATIN = /[a-z]/i;
const NON_LATIN_LETTER = /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F]/;
function decodeTags(s) {
	let out = "";
	for (const ch of s.matchAll(TAG)) {
		const cp = ch[0].codePointAt(0) - 917504;
		if (cp >= 32 && cp < 127) out += String.fromCharCode(cp);
	}
	return out;
}
function decodeVariationSelectors(s) {
	const out = [];
	for (const run of s.matchAll(VS_RUN)) {
		const bytes = Array.from(run[0], (c) => {
			const cp = c.codePointAt(0);
			return cp <= 65039 ? cp - 65024 : cp - 917760 + 16;
		});
		const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes)).replace(/[^\x20-\x7e\n\t\u00a0-\uffff]/g, "");
		if (text.trim()) out.push(text);
	}
	return out.join("\n");
}
/** Canonical form the rules match against: NFKC, invisibles stripped, confusables folded, lowercase. */
function canon(s) {
	let t = s.normalize("NFKC").replace(ZERO_WIDTH, "").replace(BIDI, "").replace(TAG, "").replace(VS_SUPP, "");
	t = Array.from(t, (c) => CONFUSABLE[c] ?? c).join("").toLowerCase();
	t = t.replace(/\b(?:[a-z][\s._\-*]){3,}[a-z]\b/g, (m) => m.replace(/[\s._\-*]/g, ""));
	return t.replace(/\s+/g, " ");
}
function deleet(s) {
	return s.replace(/(?<=[a-z])[013457@$]|[013457@$](?=[a-z])/g, (c) => LEET[c] ?? c);
}
function decodeBase64Blobs(s) {
	const out = [];
	for (const m of s.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) try {
		const raw = atob(m[0]);
		const printable = raw.replace(/[^\x20-\x7e\n\r\t]/g, "");
		if (printable.length >= raw.length * .9 && /[a-z]{3,}\s+[a-z]{2,}/i.test(printable)) out.push(printable);
	} catch {}
	return out;
}
function htmlHidden(s) {
	const out = [];
	for (const m of s.matchAll(/<!--([\s\S]*?)-->/g)) out.push(m[1]);
	for (const m of s.matchAll(/<(\w+)[^>]*style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0(?:\.0+)?\b|color\s*:\s*(?:#fff(?:fff)?|white|transparent))[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)) out.push(m[3]);
	return out.map((x) => x.trim()).filter(Boolean);
}
function unmask(input) {
	const layers = [{
		layer: "visible",
		text: input
	}];
	const tagText = decodeTags(input);
	if (tagText) layers.push({
		layer: "tag-smuggled",
		text: tagText
	});
	const vsText = decodeVariationSelectors(input);
	if (vsText) layers.push({
		layer: "vs-smuggled",
		text: vsText
	});
	for (const t of htmlHidden(input)) layers.push({
		layer: "html-hidden",
		text: t
	});
	for (const t of decodeBase64Blobs(input)) layers.push({
		layer: "base64",
		text: t
	});
	const mixedScriptWords = [...new Set(input.normalize("NFKC").split(/[^\p{L}]+/u).filter((w) => w.length > 2 && LATIN.test(w) && NON_LATIN_LETTER.test(w) && [...w].some((c) => c in CONFUSABLE)))];
	return {
		layers,
		invisibleCount: (input.match(ZERO_WIDTH) ?? []).length,
		bidiCount: (input.match(BIDI) ?? []).length,
		tagCount: (input.match(TAG) ?? []).length,
		vsRun: Math.max(0, ...Array.from(input.matchAll(VS_RUN), (m) => [...m[0]].length)),
		mixedScriptWords
	};
}
// src/engine/rules.ts
const V_IGNORE = "(?:ignore|disregard|forget|override|bypass|skip|abandon|drop|abaikan|lupakan)";
const RULES = [
	{
		id: "OVR-001",
		category: "override",
		weight: 60,
		re: new RegExp(`${V_IGNORE}\\s+(?:all |any |the |your |these |those |semua |)?(?:previous|prior|above|earlier|preceding|original|initial|existing|system|developer|sebelumnya)\\s*(?:instructions?|prompts?|rules?|directives?|guidelines?|context|messages?|constraints?|guardrails?|policies|instruksi|perintah|aturan)`),
		why: "Tells the agent to drop its existing instructions"
	},
	{
		id: "OVR-002",
		category: "override",
		weight: 40,
		re: new RegExp(`${V_IGNORE}\\s+(?:everything|anything|all)\\s+(?:you were|you've been|above|before)`),
		why: "Blanket instruction reset"
	},
	{
		id: "OVR-003",
		category: "override",
		weight: 35,
		re: /\b(?:new|updated|revised|real|actual|true)\s+(?:instructions?|system prompt|task|directive|orders?)\s*(?:are|is|:|follow)/,
		why: "Claims to replace the agent's real task"
	},
	{
		id: "OVR-004",
		category: "override",
		weight: 30,
		re: /\bfrom now on\b.{0,40}\b(?:you (?:will|must|are|shall)|always|never|only)\b/,
		why: "Persistent behaviour rewrite"
	},
	{
		id: "OVR-005",
		category: "override",
		weight: 25,
		re: /\b(?:do not|don't|never) (?:tell|inform|alert|notify|mention (?:this )?to) (?:the )?(?:user|owner|human|operator)\b/,
		why: "Asks the agent to hide actions from its owner"
	},
	{
		id: "ROLE-001",
		category: "role-hijack",
		weight: 35,
		re: /\byou are (?:now|no longer)\b/,
		why: "Reassigns the agent's identity"
	},
	{
		id: "ROLE-002",
		category: "role-hijack",
		weight: 40,
		re: /\b(?:dan|developer mode|god mode|jailbreak(?:ed)?|unfiltered|uncensored|no restrictions|without (?:any )?(?:restrictions|limits|filters))\b/,
		why: "Known jailbreak persona / mode"
	},
	{
		id: "ROLE-003",
		category: "role-hijack",
		weight: 25,
		re: /\b(?:pretend|act as if|roleplay as|imagine) (?:you are|you're|to be)\b.{0,60}\b(?:no|without|free of|ignore)\b/,
		why: "Roleplay used to shed constraints"
	},
	{
		id: "ROLE-004",
		category: "role-hijack",
		weight: 30,
		re: /\b(?:i am|this is) (?:your|the) (?:developer|creator|admin(?:istrator)?|owner|operator|system)\b/,
		why: "Impersonates a privileged principal"
	},
	{
		id: "LEAK-001",
		category: "prompt-leak",
		weight: 35,
		re: /\b(?:reveal|print|show|repeat|output|dump|display|leak|tell me)\b.{0,30}\b(?:system prompt|initial prompt|hidden (?:prompt|instructions)|your (?:instructions|rules|prompt)|instructions above)\b/,
		why: "Attempts to extract the system prompt"
	},
	{
		id: "LEAK-002",
		category: "prompt-leak",
		weight: 30,
		re: /\b(?:repeat|print|output) (?:everything|all(?: the)? text|the words?) (?:above|before|preceding)\b/,
		why: "Classic 'repeat the above' extraction"
	},
	{
		id: "DLM-001",
		category: "fake-delimiter",
		weight: 45,
		re: /<\|(?:im_start|im_end|system|endoftext|eot_id|start_header_id|end_header_id)\|>/,
		why: "Chat-template control token in untrusted data"
	},
	{
		id: "DLM-002",
		category: "fake-delimiter",
		weight: 35,
		re: /(?:^|\n)\s*(?:#{1,3}\s*)?(?:system|assistant|developer)\s*(?:message|prompt)?\s*:\s*\S/,
		why: "Fake role header injected into content"
	},
	{
		id: "DLM-003",
		category: "fake-delimiter",
		weight: 35,
		re: /<\/?(?:system|instructions?|admin|sudo|tool_call|function_call)>|\[\/?(?:inst|system|sys)\]|<<\/?sys>>/,
		why: "Fake system/tool tag"
	},
	{
		id: "DLM-004",
		category: "fake-delimiter",
		weight: 20,
		re: /\b(?:end of (?:document|context|user input|data)|begin(?:ning)? (?:new|real) instructions)\b/,
		why: "Pretends the data section ended"
	},
	{
		id: "ACT-001",
		category: "action-hijack",
		weight: 50,
		re: /\b(?:send|transfer|withdraw|bridge|move|sweep|drain|kirim)\b.{0,40}\b(?:all|entire|max|everything|full balance|semua)\b.{0,40}\b(?:to|ke)\b.{0,10}0x[0-9a-f]{40}/,
		why: "Instructs a full-balance transfer to an address"
	},
	{
		id: "ACT-002",
		category: "action-hijack",
		weight: 40,
		re: /\b(?:send|transfer|pay|withdraw|kirim)\b.{0,40}\b(?:to|ke)\b\s*0x[0-9a-f]{40}/,
		why: "Instructs a transfer to an embedded address"
	},
	{
		id: "ACT-003",
		category: "action-hijack",
		weight: 45,
		re: /\b(?:approve|setapprovalforall|increaseallowance|permit)\b.{0,40}\b(?:unlimited|max|infinite|uint256|2\^256|type\(uint256\)|115792089)/,
		why: "Unlimited token approval"
	},
	{
		id: "ACT-004",
		category: "action-hijack",
		weight: 40,
		re: /\b(?:sign|execute|call|run|invoke)\b.{0,30}\b(?:this|the following|attached)\b.{0,20}\b(?:transaction|tx|message|typed data|calldata|payload|command|tool)\b/,
		why: "Asks the agent to sign/execute provided payload"
	},
	{
		id: "ACT-005",
		category: "action-hijack",
		weight: 45,
		re: /\b(?:rm -rf|curl [^|\n]{0,80}\|\s*(?:sh|bash)|wget [^|\n]{0,80}\|\s*(?:sh|bash)|chmod \+x|eval\(|os\.system|subprocess|powershell -e)/,
		why: "Shell command / remote code execution"
	},
	{
		id: "ACT-006",
		category: "action-hijack",
		weight: 35,
		re: /\b(?:call|use|invoke|trigger)\b.{0,20}\b(?:tool|function)\b.{0,30}\b(?:with|args?|arguments?|parameters?)\b/,
		why: "Directs a specific tool invocation"
	},
	{
		id: "EXF-001",
		category: "exfiltration",
		weight: 45,
		re: /!\[[^\]]*\]\(https?:\/\/[^)\s]+\?[^)\s]*(?:\{|%7b|data|q|d|secret|key|token|prompt|history)=/,
		why: "Markdown image beacon that smuggles data in the URL"
	},
	{
		id: "EXF-002",
		category: "exfiltration",
		weight: 40,
		re: /\b(?:send|post|upload|forward|exfiltrate|leak|include|append)\b.{0,40}\b(?:private key|seed|mnemonic|api key|secret|password|credentials?|\.env|cookies?|session|conversation|chat history|system prompt)\b/,
		why: "Asks to ship secrets or history somewhere"
	},
	{
		id: "EXF-003",
		category: "exfiltration",
		weight: 30,
		re: /\b(?:webhook\.site|requestbin|pipedream\.net|ngrok(?:-free)?\.(?:app|io)|interact\.sh|oast\.(?:fun|me|pro|live|site)|burpcollaborator|canarytokens|discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot)/,
		why: "Known data-collection endpoint"
	},
	{
		id: "OBF-001",
		category: "obfuscation",
		weight: 20,
		re: /\b(?:decode|base64 ?decode|rot13|reverse) (?:this|the following|and (?:follow|execute|run|obey))\b/,
		why: "Asks the agent to decode then obey"
	},
	{
		id: "OVR-006",
		category: "override",
		weight: 60,
		re: /\b(?:forget|ignore|disregard)\s+(?:about\s+)?(?:everything|all(?:\s+(?:of\s+)?(?:that|this|the above|previous|preceding|prior|earlier|assignments|tasks|orders|commands))?|(?:the\s+)?above|what (?:i|we) (?:said|discussed|told you))\b/,
		why: "Blanket reset: forget/ignore everything or the above"
	},
	{
		id: "OVR-007",
		category: "override",
		weight: 55,
		re: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:preceding|previous|prior|above|earlier)\s+(?:orders|commands|tasks|assignments|information|input|text)\b/,
		why: "Drops earlier orders or tasks"
	},
	{
		id: "OVR-008",
		category: "override",
		weight: 50,
		re: /\b(?:leave|put|set)\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|earlier)\s+(?:information|tasks?|instructions?)\s+(?:behind|aside)|\bremove\s+all\s+(?:the\s+)?(?:previous|prior)\s+(?:tasks|instructions|information)\b|\bstart\s+(?:over|from\s+(?:the\s+)?(?:front|scratch|beginning))\b.{0,40}\b(?:new|task)\b/,
		why: "Asks to discard prior context and start a new task"
	},
	{
		id: "OVR-009",
		category: "override",
		weight: 35,
		re: /\b(?:very good|well done|good job|great job|excellent(?: performance)?|simply great|wow|perfect|congratulations[^.!]{0,30}|that is (?:done|enough)|that'?s (?:done|enough))\b[^\n]{0,80}\bnow\b[^\n]{0,40}\b(?:new|another|further|next|following)\s+(?:task|challenge|assignment|question)s?\b|\b(?:that is|that'?s) enough\.?\s+now\b/,
		why: "Praise, then pivot to a new task (classic injection opener)"
	},
	{
		id: "OVR-010",
		category: "override",
		weight: 40,
		re: /\b(?:attention|stop)\s*[-!:]+\s*(?:stop|attention)?\s*[-!:]*\s*i\s+(?:urgently\s+)?need\b/,
		why: "Urgent interrupt to hijack the current task"
	},
	{
		id: "ROLE-005",
		category: "role-hijack",
		weight: 35,
		re: /\b(?:now|okay|ok)[.,]?\s+you are\s+(?!(?:done|ready|right|correct|welcome)\b)[a-z]/,
		why: "Assigns the agent a new identity mid-conversation"
	},
	{
		id: "ROLE-006",
		category: "role-hijack",
		weight: 30,
		re: /\b(?:pretend|imagine)\s+(?:that\s+)?you(?:'re| are)\s+(?:an?\s+)?(?:evil|malicious|unrestricted|rogue|hacker|criminal)\b/,
		why: "Roleplay as a malicious persona"
	},
	{
		id: "ROLE-007",
		category: "role-hijack",
		weight: 30,
		re: /\bi want you to act as (?:an?\s+)?(?:linux|terminal|console|shell|sql|javascript|python|interpreter|debater|interviewer|travel guide|storyteller)\b/,
		why: "Reassigns the agent to a scripted persona"
	},
	{
		id: "OVR-011",
		category: "override",
		weight: 35,
		re: /\b(?:that is|that'?s)\s+(?:done|finished|complete)\.?\s+now\b|\bnow (?:i have|here is|comes?) (?:a|an|another|my)\s+(?:great\s+|real\s+|new\s+)*(?:new\s+)?(?:challenge|task|assignment)\s+for you\b|\bnow (?:follow|come)s?\s+(?:new|further|the real)\s+(?:tasks|instructions|orders)\b/,
		why: "Closes the current task and pivots to a new one"
	},
	{
		id: "LEAK-004",
		category: "prompt-leak",
		weight: 40,
		re: /\bwhat (?:was|is) written (?:at the (?:beginning|start|top)|above|before)\b|\b(?:repeat|print)\s+(?:the\s+)?(?:first|initial)\s+(?:line|lines|message|sentence)s?\s+(?:of|in)\s+(?:this|your|the)\s+(?:prompt|conversation)\b/,
		why: "Asks what came before in the prompt"
	},
	{
		id: "LEAK-003",
		category: "prompt-leak",
		weight: 40,
		re: /\b(?:show|print|display|output|give)\s+(?:me\s+)?(?:all\s+)?(?:of\s+)?(?:your|the)\s+(?:entire\s+|whole\s+|full\s+|complete\s+)?(?:prompt(?:\s*text)?|instructions|system message)\b/,
		why: "Asks for the full prompt text"
	},
	{
		id: "DE-OVR-001",
		category: "override",
		weight: 60,
		re: /\b(?:vergiss|vergessen sie|ignoriere|ignorieren sie|missachte)\b[^.\n]{0,40}\b(?:alle[ns]?|die|deine|ihre)?\s*(?:vorherigen|vorangehenden|obigen|bisherigen|früheren|vorigen)?\s*(?:anweisungen|aufgaben|aufträge|befehle|angaben|informationen|instruktionen|regeln)\b/,
		why: "German: drop previous instructions or tasks"
	},
	{
		id: "DE-OVR-002",
		category: "override",
		weight: 55,
		re: /\b(?:vergiss|vergessen sie)\s+(?:alles|das alles|all das)\b/,
		why: "German: forget everything"
	},
	{
		id: "DE-OVR-003",
		category: "override",
		weight: 35,
		re: /\b(?:sehr gut|gut gemacht|super|toll|fantastisch|hervorragend|ausgezeichnet|perfekt|das genügt|das reicht|okay)\b[^\n]{0,100}\b(?:jetzt|nun)\b[^\n]{0,60}\b(?:neue[nr]?|weitere|folgende[nr]?|nächste)\s+(?:aufgabe|aufgaben|herausforderung|frage)\b/,
		why: "German: praise, then pivot to a new task"
	},
	{
		id: "DE-OVR-005",
		category: "override",
		weight: 55,
		re: /\b(?:die\s+)?(?:obigen|vorherigen|bisherigen)\s+(?:ausführungen|anweisungen|aufgaben|informationen)\s+(?:ignorieren|vergessen)\b|\b(?:alle\s+)?(?:vorherigen|vorangegangenen|bisherigen)\s+(?:informationen|aufgaben|anweisungen)\s+(?:hinter sich|aus dem kopf)\b/,
		why: "German: discard the earlier text or tasks"
	},
	{
		id: "DE-OVR-006",
		category: "override",
		weight: 35,
		re: /\b(?:das ist|ist)\s+erledigt\.?\s+(?:\w+\s+){0,2}(?:nun|jetzt)\b|\b(?:nun|jetzt)\s+folgen\s+(?:neue|weitere)\s+(?:anweisungen|aufgaben|aufträge)\b|\b(?:jetzt|nun)\s+habe ich\s+(?:eine|einen)\s+(?:\w+\s+){0,2}neue\s+(?:herausforderung|aufgabe)\b/,
		why: "German: closes the task and pivots to a new one"
	},
	{
		id: "DE-OVR-004",
		category: "override",
		weight: 40,
		re: /\b(?:achtung|stopp?)\s*[-!:]+\s*(?:stopp?|achtung)?\s*[-!:]*\s*ich\s+(?:benötige|brauche)\b/,
		why: "German: urgent interrupt"
	},
	{
		id: "DE-ROLE-001",
		category: "role-hijack",
		weight: 35,
		re: /\b(?:jetzt|nun)\s+bist\s+du\b|\bstell\s+dir\s+vor,?\s+du\s+bist\b|\bdu\s+bist\s+(?:jetzt|nun|ab sofort)\b/,
		why: "German: assigns a new identity"
	},
	{
		id: "DE-ROLE-002",
		category: "role-hijack",
		weight: 30,
		re: /\bich möchte,? dass (?:sie|du) als\b[^.\n]{0,60}\b(?:fungieren|fungierst|agieren|agierst|auftreten)\b/,
		why: "German: reassigns the agent to a persona"
	},
	{
		id: "DE-LEAK-001",
		category: "prompt-leak",
		weight: 40,
		re: /\b(?:zeige?|gib)\s+(?:mir\s+)?(?:alle\s+)?(?:deine[nr]?|ihre[nr]?|den)\s+(?:gesamten\s+|ganzen\s+|kompletten\s+)?(?:prompt(?:-?text)?|anweisungen|systemnachricht)\b|\bkopie des vollständigen prompt/,
		why: "German: asks for the prompt text"
	}
];
const SECRETS = [
	{
		id: "SEC-EVMKEY",
		label: "EVM private key",
		weight: 60,
		re: /(?:priv(?:ate)?[_ -]?key|secret[_ -]?key|signer[_ -]?key|wallet[_ -]?key|\bpk)["']?\s*[:=]\s*["']?(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/gi
	},
	{
		id: "SEC-OPENAI",
		label: "OpenAI key",
		weight: 55,
		re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g
	},
	{
		id: "SEC-ANTHROPIC",
		label: "Anthropic key",
		weight: 55,
		re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g
	},
	{
		id: "SEC-GITHUB",
		label: "GitHub token",
		weight: 55,
		re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{30,}\b/g
	},
	{
		id: "SEC-AWS",
		label: "AWS access key",
		weight: 50,
		re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
	},
	{
		id: "SEC-TGBOT",
		label: "Telegram bot token",
		weight: 50,
		re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g
	},
	{
		id: "SEC-SLACK",
		label: "Slack token",
		weight: 50,
		re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g
	},
	{
		id: "SEC-JWT",
		label: "JWT",
		weight: 30,
		re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
	},
	{
		id: "SEC-PEM",
		label: "PEM private key",
		weight: 60,
		re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g
	}
];
// src/engine/scan.ts
const THRESHOLD = {
	review: 30,
	block: 60
};
const HIDDEN_LAYER_BONUS = 15;
function redact(s) {
	return s.length <= 12 ? s.slice(0, 4) + "…" : s.slice(0, 6) + "…" + s.slice(-4);
}
/** Mask anything secret-shaped before text leaves the scanner. Output-side, so it masks bare 64-hex too. */
function maskSecrets(s) {
	let out = s;
	for (const r of SECRETS) out = out.replace(new RegExp(r.re.source, r.re.flags), (m) => redact(m));
	out = out.replace(/(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g, (m) => redact(m));
	return out.replace(/\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g, (m) => m.split(/\s+/).length >= 12 ? "[12+ word phrase masked]" : m);
}
const SKILL_IGNORED = /* @__PURE__ */ new Set(["ACT-005", "ACT-006"]);
function stripMentions(s) {
	return s.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").replace(/"[^"\n]{0,200}"|“[^”\n]{0,200}”|'[^'\n]{4,200}'/g, " ");
}
function scan(input, opts = {}) {
	const t0 = performance.now();
	const skill = opts.mode === "skill";
	const u = unmask(input);
	const findings = [];
	const seen = /* @__PURE__ */ new Set();
	for (const { layer, text } of u.layers) {
		const c = canon(skill && layer === "visible" ? stripMentions(text) : text);
		const variants = c === deleet(c) ? [c] : [c, deleet(c)];
		for (const rule of RULES) {
			if (seen.has(rule.id + layer)) continue;
			if (skill && layer === "visible" && SKILL_IGNORED.has(rule.id)) continue;
			for (const v of variants) {
				const m = v.match(rule.re);
				if (!m) continue;
				seen.add(rule.id + layer);
				findings.push({
					id: rule.id,
					category: rule.category,
					layer,
					weight: rule.weight + (layer === "visible" ? 0 : HIDDEN_LAYER_BONUS),
					why: rule.why,
					match: m[0].slice(0, 120)
				});
				break;
			}
		}
		for (const s of SECRETS) {
			const m = text.match(s.re);
			if (!m || seen.has(s.id)) continue;
			seen.add(s.id);
			findings.push({
				id: s.id,
				category: "secret",
				layer,
				weight: s.weight,
				why: `${s.label} present in text`,
				match: redact(m[0])
			});
		}
	}
	if (/\b(?:seed phrase|mnemonic|recovery phrase|secret phrase)\b\s*[:=]?\s*(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/i.test(input)) findings.push({
		id: "SEC-MNEMONIC",
		category: "secret",
		layer: "visible",
		weight: 60,
		why: "Labelled seed phrase present in text",
		match: "seed phrase: ••••"
	});
	if (u.tagCount > 0) findings.push({
		id: "OBF-TAG",
		category: "obfuscation",
		layer: "tag-smuggled",
		weight: 40,
		why: `${u.tagCount} invisible Unicode TAG chars (ASCII smuggling)`,
		match: "U+E00xx"
	});
	if (u.vsRun >= 2) findings.push({
		id: "OBF-VS",
		category: "obfuscation",
		layer: "vs-smuggled",
		weight: 40,
		why: `${u.vsRun} variation selectors in a row (emoji smuggling: one hidden byte each)`,
		match: "U+FE0x/U+E01xx"
	});
	if (u.bidiCount > 0) findings.push({
		id: "OBF-BIDI",
		category: "obfuscation",
		layer: "visible",
		weight: 20,
		why: `${u.bidiCount} bidi override chars (text renders differently than it reads)`,
		match: "U+202x"
	});
	if (u.invisibleCount >= 3) findings.push({
		id: "OBF-ZW",
		category: "obfuscation",
		layer: "visible",
		weight: 15,
		why: `${u.invisibleCount} zero-width chars splitting words`,
		match: "U+200B…"
	});
	if (u.mixedScriptWords.length) findings.push({
		id: "OBF-HOMO",
		category: "obfuscation",
		layer: "visible",
		weight: 15,
		why: "Latin words spelled with Cyrillic/Greek look-alikes",
		match: u.mixedScriptWords.slice(0, 3).join(", ")
	});
	const weights = findings.map((f) => f.weight).sort((a, b) => b - a);
	const score = Math.min(100, Math.round(weights.reduce((acc, w, i) => acc + w * Math.pow(.6, i), 0)));
	const hardBlock = findings.some((f) => f.category === "secret" || f.layer !== "visible" && f.category !== "obfuscation");
	return {
		verdict: score >= THRESHOLD.block || hardBlock ? "block" : score >= THRESHOLD.review ? "review" : "allow",
		score: hardBlock ? Math.max(score, THRESHOLD.block) : score,
		findings: findings.sort((a, b) => b.weight - a.weight),
		hiddenText: u.layers.filter((l) => l.layer !== "visible"),
		stats: {
			invisible: u.invisibleCount,
			bidi: u.bidiCount,
			tagChars: u.tagCount,
			mixedScript: u.mixedScriptWords
		},
		ms: performance.now() - t0
	};
}
// src/pack-cli.ts
const args = process.argv.slice(2);
const json = args.includes("--json");
const targets = args.filter((a) => a !== "--json");
function walk(p, out) {
	if (statSync(p).isDirectory()) {
		for (const e of readdirSync(p)) if (e !== "node_modules" && e !== ".git") walk(join(p, e), out);
	} else if (/\.md$/i.test(p)) out.push(p);
	return out;
}
const files = targets.flatMap((t) => walk(t, []));
const results = files.map((f) => ({
	file: f,
	r: scan(readFileSync(f, "utf8"), { mode: "skill" })
}));
if (json) console.log(JSON.stringify(results.map(({ file, r }) => ({
	file: relative(process.cwd(), file),
	verdict: r.verdict,
	score: r.score,
	findings: r.findings.map((f) => ({
		id: f.id,
		layer: f.layer,
		why: f.why,
		match: maskSecrets(f.match)
	})),
	hidden: r.hiddenText.map((h) => ({
		layer: h.layer,
		text: maskSecrets(h.text).slice(0, 160)
	}))
}))));
else {
	for (const { file, r } of results) {
		console.log(`${r.verdict.toUpperCase().padEnd(6)} ${String(r.score).padStart(3)}  ${relative(process.cwd(), file)}`);
		for (const f of r.findings) console.log(`         ${f.id} [${f.layer}] ${f.why} «${maskSecrets(f.match)}»`);
		for (const h of r.hiddenText) console.log(`         hidden[${h.layer}]: ${maskSecrets(h.text).slice(0, 160)}`);
	}
	const n = (v) => results.filter((x) => x.r.verdict === v).length;
	console.log(`\n${files.length} files · ${n("block")} block · ${n("review")} review · ${n("allow")} allow`);
}
process.exit(results.some((x) => x.r.verdict === "block") ? 2 : results.some((x) => x.r.verdict === "review") ? 1 : 0);
export {};
