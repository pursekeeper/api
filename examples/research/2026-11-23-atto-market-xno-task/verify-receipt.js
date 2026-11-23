#!/usr/bin/env node
// Verify an Atto Marketplace task receipt offline (no account, no token).
//   node verify-receipt.js receipt.json key.json
// receipt.json = body of GET https://api.atto.market/v1/tasks/<taskId>/receipt
// key.json     = body of GET https://api.atto.market/v1/receipts/keys/<keyVersion>
// Checks: sha256(canonical bytes) == contentSha256; the canonical JSON equals the displayed content;
// Ed25519 signature over  schema + NUL + sha256  (the guide's "Verify signed receipts").
'use strict';
const fs = require('fs'), crypto = require('crypto');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const k = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const canon = Buffer.from(r.canonicalBase64, 'base64');
const digest = crypto.createHash('sha256').update(canon).digest();
const hashOk = digest.toString('hex') === r.contentSha256;
const shown = JSON.parse(canon.toString('utf8'));
const sameContent = JSON.stringify(Object.keys(shown).sort().reduce((o, x) => (o[x] = shown[x], o), {})) ===
                    JSON.stringify(Object.keys(r.content).sort().reduce((o, x) => (o[x] = r.content[x], o), {}));
const key = crypto.createPublicKey({ key: Buffer.from(k.publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
const sig = Buffer.from(r.signatureBase64, 'base64');
const schema = shown.schema;
const forms = {
  'schema + NUL + raw sha256 (32 bytes)': Buffer.concat([Buffer.from(schema, 'utf8'), Buffer.from([0]), digest]),
  'schema + NUL + hex sha256 (64 chars)': Buffer.concat([Buffer.from(schema, 'utf8'), Buffer.from([0]), Buffer.from(digest.toString('hex'), 'utf8')]),
};
let signed = null;
for (const [name, msg] of Object.entries(forms)) if (crypto.verify(null, msg, key, sig)) signed = name;
console.log(JSON.stringify({ receiptId: r.receiptId, schema, keyVersion: r.keyVersion, keyVersionMatches: r.keyVersion === k.version,
  hashOk, sameContent, signatureOk: !!signed, signedForm: signed, outcome: shown.outcome, asset: shown.asset, grossAtomic: shown.grossAtomic }, null, 1));
process.exit(hashOk && sameContent && signed ? 0 : 1);
