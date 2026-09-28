#!/usr/bin/env bash
# Copy the four files shared between pursekeeper.dev/examples (api/examples/) and the pursekeeper
# OpenClaw skill (skill/pursekeeper/references/ and scripts/, github.com/pursekeeper/skill),
# api -> skill, and print what changed. The site copy is the source of truth: edit it, run this,
# then bump the skill (SKILL.md `version:` and CHANGELOG.md) and publish with clawhub.
#
# The four files are written location-neutral (absolute pursekeeper.dev URLs, no relative links,
# no path that only resolves on one side), so every pair is byte-identical and
# test/skill-sync.test.js compares them with no per-location rewrite. There are no
# location-specific lines today; if one ever becomes necessary, add the rewrite here AND in the
# test, and keep it to that one line.
#
# Background: the skill copies had missed every fix since 0.1.0 and the site copy of
# client-x402.js lacked the NANO_MAX_PAY cap from 0.1.1/0.1.2 (pyfile-toolkit, 2026-09-28).
#
# Usage: scripts/sync-skill.sh            copy and report
#        scripts/sync-skill.sh --check    report only, copy nothing, exit 1 on any drift
# Env:   SKILL_DIR   the skill folder (default ../skill/pursekeeper next to api/)
set -euo pipefail
API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_DIR="${SKILL_DIR:-$API_DIR/../skill/pursekeeper}"
[ -f "$SKILL_DIR/SKILL.md" ] || { echo "skill folder not found at $SKILL_DIR (set SKILL_DIR)" >&2; exit 2; }
SKILL_DIR="$(cd "$SKILL_DIR" && pwd)"
check=0; [ "${1:-}" = "--check" ] && check=1

PAIRS="no-node.md:references/no-node.md
no-node.js:scripts/no-node.js
client-x402.js:scripts/client-x402.js
buy-from-nanogpt.md:references/buy-from-nanogpt.md"

drift=0
while IFS=: read -r src dst; do
  s="$API_DIR/examples/$src"; d="$SKILL_DIR/$dst"
  [ -f "$s" ] || { echo "missing   examples/$src" >&2; exit 2; }
  if [ ! -f "$d" ]; then
    drift=1
    if [ $check = 1 ]; then echo "absent    $dst"; else cp "$s" "$d"; echo "created   $dst  <- examples/$src"; fi
    continue
  fi
  if cmp -s "$s" "$d"; then echo "same      $dst"; continue; fi
  drift=1
  # lines the skill copy gains (+) and loses (-) when examples/ overwrites it; diff exits 1 on difference, hence || true
  counts=$(diff "$s" "$d" | awk '/^</{a++} /^>/{r++} END{printf "+%d -%d", a, r}' || true)
  if [ $check = 1 ]; then echo "drift     $dst  ($counts lines behind examples/$src)"
  else cp "$s" "$d"; echo "updated   $dst  <- examples/$src ($counts lines)"; fi
done <<< "$PAIRS"

if [ $drift = 1 ]; then
  if [ $check = 1 ]; then echo "drift found; run scripts/sync-skill.sh to copy examples/ -> skill" >&2; exit 1; fi
  echo "next: node --check on the .js files, npm test in $API_DIR, then bump SKILL.md version + CHANGELOG.md in $SKILL_DIR and commit there"
else
  echo "in sync"
fi
