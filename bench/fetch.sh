#!/usr/bin/env bash
# Downloads deepset/prompt-injections (Apache-2.0) into bench/data/{train,test}.jsonl.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data
for split in train test; do
  : > "data/$split.jsonl"
  off=0
  while :; do
    n=$(curl -sf "https://datasets-server.huggingface.co/rows?dataset=deepset/prompt-injections&config=default&split=$split&offset=$off&length=100" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).rows||[];for(const x of r)console.log(JSON.stringify(x.row));})' \
      | tee -a "data/$split.jsonl" | wc -l)
    [ "$n" -lt 100 ] && break
    off=$((off + 100))
  done
  echo "$split: $(wc -l < "data/$split.jsonl") rows"
done
