// Public GET-only Speedbot snapshot. No credentials, account actions, or claims.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const endpoints = {
  launch: 'https://speedbot.dev/api/launch',
  help: 'https://speedbot.dev/api/work-response-bonus',
};
async function get(name, url) {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 15000);
  try {
    const requested_utc = new Date().toISOString();
    const response = await fetch(url, { method: 'GET', signal: ctl.signal,
      redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 100000) throw new Error(`${name}: unexpectedly large response`);
    return {
      url, requested_utc, retrieved_utc: new Date().toISOString(),
      http_status: response.status, http_date: response.headers.get('date'),
      response_bytes: bytes.length, source_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      bytes, data: JSON.parse(bytes.toString('utf8')),
    };
  } finally { clearTimeout(timeout); }
}
const launch = await get('launch', endpoints.launch);
const help = await get('help', endpoints.help);
const l = launch.data, h = help.data;
if (l?.id !== 'speedbot-first-collaborations' ||
    l.execution_testing_pilot?.id !== 'service-field-test-v1' ||
    h?.id !== 'speedbot-help-real-work-v1') throw new Error('Unexpected program IDs.');
const snapshot = {
  schema: 'copperglass-public-speedbot-research-snapshot-v1',
  generated_utc: new Date().toISOString(),
  sources: {
    launch: Object.fromEntries(Object.entries(launch).filter(([k]) => k !== 'data' && k !== 'bytes')),
    help: Object.fromEntries(Object.entries(help).filter(([k]) => k !== 'data' && k !== 'bytes')),
  },
  collaboration: {
    policy_version: l.policy_version,
    reward_usdc: l.maximum_usdc_per_participant,
    participants_approved: l.participants_approved,
    participant_slots_remaining: l.participant_slots_remaining,
    purchase_required: l.purchase_required,
  },
  shared_bootstrap_pool: {
    mode: l.shared_budget?.mode,
    verified: l.shared_budget?.verified,
    unit: l.shared_budget?.unit,
    total_micro_usdc: l.shared_budget?.total,
    paid_micro_usdc: l.shared_budget?.paid,
    committed_micro_usdc: l.shared_budget?.committed,
    reserved_micro_usdc: l.shared_budget?.reserved,
    available_micro_usdc: l.shared_budget?.available,
    remaining_micro_usdc: l.shared_budget?.remaining,
    checked_at_ms: l.shared_budget?.checked_at,
    escrowed: l.funding?.escrowed,
  },
  first_service_listing_bonus: {
    reward_usdc: l.service_listing_bonus?.reward_usdc,
    enabled: l.service_listing_bonus?.enabled,
    operator_limit: 'One bonus per declared operator/team/swarm and wallet (see live rule).',
    rule_source: endpoints.launch,
  },
  independent_field_test_pilot: {
    campaign_id: l.execution_testing_pilot?.campaign_id,
    enabled: l.execution_testing_pilot?.enabled,
    reward_usdc: l.execution_testing_pilot?.reward_usdc,
    campaign_budget_usdc: l.execution_testing_pilot?.budget_usdc,
    campaign_paid_usdc: l.execution_testing_pilot?.paid_usdc,
    campaign_reserved_usdc: l.execution_testing_pilot?.reserved_usdc,
    campaign_available_usdc: l.execution_testing_pilot?.available_usdc,
    campaign_slots_remaining: l.execution_testing_pilot?.slots_remaining,
    reward_independent_of_outcome: l.execution_testing_pilot?.reward_independent_of_outcome,
    test_types: l.execution_testing_pilot?.supported_test_types,
    private_evidence_required: l.execution_testing_pilot?.private_evidence_field,
    note: 'Campaign capacity is distinct from shared-pool availability; a snapshot is not a reservation or approved claim.',
  },
  help_real_work: {
    reward_usdc: h.reward_usdc,
    enabled: h.enabled,
    available: h.available,
    assignable_now: h.assignable_now,
    unanswered_organic_work_requests: h.unanswered_organic_work_requests,
    pilot_reserved_usdc: h.pilot_reserved_usdc,
    pilot_paid_usdc: h.pilot_paid_usdc,
    budget_slots_remaining: h.budget_slots_remaining,
    shared_unallocated_usdc: h.shared_unallocated_usdc,
    note: 'No current organic assignment is shown by this separate program.',
  },
};
const required = [snapshot.shared_bootstrap_pool.available_micro_usdc,
  snapshot.independent_field_test_pilot.campaign_available_usdc,
  snapshot.help_real_work.assignable_now];
if (required.some(v => v === undefined || v === null)) throw new Error('A required budget field is missing.');
const outputs = {
  'public-snapshot-current.json': Buffer.from(JSON.stringify(snapshot, null, 2) + '\n'),
  'source-launch-current.json': launch.bytes,
  'source-help-current.json': help.bytes,
};
for (const [name, bytes] of Object.entries(outputs)) fs.writeFileSync(path.join(dir, name), bytes);
const inventory = { ...outputs };
for (const name of ['reproduce.mjs', 'README-current.md', 'commission-report-final.md',
  'settlement-public.json']) {
  const candidate = path.join(dir, name);
  if (fs.existsSync(candidate)) inventory[name] = fs.readFileSync(candidate);
}
const manifest = {
  schema: 'copperglass-public-report-current-manifest-v1',
  generated_utc: snapshot.generated_utc,
  original_snapshot_preserved: fs.existsSync(path.join(dir, 'public-snapshot.json')) ? 'public-snapshot.json' : null,
  files: Object.fromEntries(Object.entries(inventory).map(([name, bytes]) => [name, {
    bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }])),
};
fs.writeFileSync(path.join(dir, 'manifest-current.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote current public snapshot, source bodies and manifest (${snapshot.generated_utc}); GET only.`);

