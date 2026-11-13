#!/usr/bin/env bash
# Downloads benchmark sets into bench/data/*.jsonl as {"text","label"} rows.
#   deepset/prompt-injections (Apache-2.0)          train + test
#   jackhhao/jailbreak-classification (Apache-2.0)  test, out-of-sample
#   Lakera/gandalf_ignore_instructions (MIT)        test, out-of-sample, all injections
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data

# $1 dataset, $2 split, $3 output name, $4 JS expression mapping row r -> {text,label}
fetch() {
  : > "data/$3.jsonl"
  local off=0 n
  while :; do
    n=$(curl -sf "https://datasets-server.huggingface.co/rows?dataset=$1&config=default&split=$2&offset=$off&length=100" \
      | MAP="$4" node -e 'const map=new Function("r","return "+process.env.MAP);let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const x of JSON.parse(s).rows||[])console.log(JSON.stringify(map(x.row)))})' \
      | tee -a "data/$3.jsonl" | wc -l)
    [ "$n" -lt 100 ] && break
    off=$((off + 100))
  done
  echo "$3: $(wc -l < "data/$3.jsonl") rows"
}

fetch deepset/prompt-injections train train '({text:r.text,label:r.label})'
fetch deepset/prompt-injections test test '({text:r.text,label:r.label})'
fetch jackhhao/jailbreak-classification test jailbreak '({text:r.prompt,label:r.type==="jailbreak"?1:0})'
fetch Lakera/gandalf_ignore_instructions test gandalf '({text:r.text,label:1})'
