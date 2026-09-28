// node --test  (run from api/). The four files shared with the pursekeeper OpenClaw skill
// (github.com/pursekeeper/skill: references/ and scripts/) must be byte-identical to their copies in the
// skill checkout. They had drifted apart on every fix since skill 0.1.0 until pyfile-toolkit measured it
// on 2026-09-28. scripts/sync-skill.sh copies examples/ -> skill; this test only compares. Skipped when
// the skill checkout is not next to api/ (or set SKILL_DIR to point at it).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = process.env.SKILL_DIR || path.resolve(__dirname, '..', '..', 'skill', 'pursekeeper');
const PAIRS = [
  ['no-node.md', 'references/no-node.md'],
  ['no-node.js', 'scripts/no-node.js'],
  ['client-x402.js', 'scripts/client-x402.js'],
  ['buy-from-nanogpt.md', 'references/buy-from-nanogpt.md'],
];
const skip = fs.existsSync(path.join(SKILL, 'SKILL.md')) ? false : 'skill checkout not found at ' + SKILL;

for (const [src, dst] of PAIRS) {
  test(`examples/${src} is byte-identical to the skill's ${dst}`, { skip }, () => {
    const a = fs.readFileSync(path.join(__dirname, '..', 'examples', src), 'utf8');
    const b = fs.readFileSync(path.join(SKILL, dst), 'utf8');
    if (a === b) return;
    const la = a.split('\n'), lb = b.split('\n');
    const i = la.findIndex((l, k) => l !== lb[k]);
    const at = i === -1 ? la.length : i;   // -1: the site copy is a prefix of the skill copy
    assert.fail(`examples/${src} and skill ${dst} differ from line ${at + 1}: site ${JSON.stringify(la[at])} vs skill ${JSON.stringify(lb[at])}; run scripts/sync-skill.sh`);
  });
}
