// One-command independent verification for LinguaCourt v2.
// Re-reads everything live from Studionet and compares against
// evidence/transactions.json and EXPECTED.md. No wallet, no
// transactions, no writes.
// For error-observed steps it requires ALL of: FINALIZED,
// MAJORITY_AGREE, leader execution_result ERROR, and the live leader
// payload exactly equal to the step's recorded expected payload — a
// MAJORITY_DISAGREE or a wrong error code fails the check.
// Usage: node scripts/verify_evidence.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = path.join(REPO, 'evidence');
const source = fs.readFileSync(path.join(REPO, 'contracts', 'linguacourt.py'), 'utf8');
const deployment = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'deployment.json'), 'utf8'));
const ev = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'transactions.json'), 'utf8'));
if (ev.partial) throw new Error('evidence/transactions.json is PARTIAL — the evidence run did not finish; re-run node scripts/run_evidence.mjs');
const reader = createClient({chain: studionet});
const ADDRESS = deployment.contract_address;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  ok ? pass++ : fail++;
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function leaderRec(tx) {
  let r = tx.consensus_data?.leader_receipt;
  r = Array.isArray(r) ? r.find((x) => x.mode === 'leader') : r;
  return r;
}
function leaderPayload(tx) {
  const r = leaderRec(tx);
  if (!r) return '';
  if (r.result?.payload) return String(r.result.payload);
  if (typeof r.result?.raw === 'string') {
    try { return Buffer.from(r.result.raw, 'base64').toString(); } catch { return ''; }
  }
  return '';
}
async function receipt(hash) {
  await sleep(2500);
  return reader.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 5000, retries: 10, fullTransaction: true});
}

const code = await reader.getContractCode(ADDRESS);
check('deployed code == repo source (byte parity)', code === source, 'source sha256 ' + sha(source));

{
  const tx = await receipt(deployment.deploy_tx);
  check('deploy tx FINALIZED + MAJORITY_AGREE + leader SUCCESS',
    [7, 'FINALIZED'].includes(tx.status) && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderRec(tx)?.execution_result === 'SUCCESS', deployment.deploy_tx.slice(0, 18));
}

const protocol = await reader.readContract({address: ADDRESS, functionName: 'get_protocol', args: [], transactionHashVariant: 'latest-final'});
check('protocol is linguacourt-2', protocol === 'linguacourt-2', String(protocol));

for (const s of ev.steps) {
  if (!s.hash) { check(s.label + ' has a tx hash', false); continue; }
  const tx = await receipt(s.hash);
  if (s.outcome === 'ok') {
    check(`${s.label} FINALIZED + MAJORITY_AGREE + leader SUCCESS`,
      [7, 'FINALIZED'].includes(tx.status) && [6, 'MAJORITY_AGREE'].includes(tx.result)
      && leaderRec(tx)?.execution_result === 'SUCCESS', s.hash.slice(0, 18));
  } else if (s.outcome === 'error-observed') {
    // A negative only passes when consensus AGREES the call errors with
    // exactly the expected code: FINALIZED + MAJORITY_AGREE + leader
    // ERROR + live payload === the payload recorded in
    // evidence/transactions.json. A MAJORITY_DISAGREE (consensus itself
    // split) or a wrong error code FAILS — it must never count as a pass.
    const livePayload = leaderPayload(tx);
    const expectedPayload = typeof s.payload === 'string' ? s.payload : '';
    check(`${s.label} FINALIZED + MAJORITY_AGREE + leader ERROR + payload ${expectedPayload || '(no expected payload recorded)'}`,
      [7, 'FINALIZED'].includes(tx.status) && [6, 'MAJORITY_AGREE'].includes(tx.result)
      && leaderRec(tx)?.execution_result === 'ERROR'
      && expectedPayload.length > 0 && livePayload === expectedPayload,
      s.hash.slice(0, 18) + ' payload=' + livePayload.slice(0, 80));
  } else {
    check(`${s.label} recorded outcome ${s.outcome} re-read FINALIZED`,
      [7, 'FINALIZED'].includes(tx.status), s.hash.slice(0, 18));
  }
}

await sleep(3000);
const totals = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_totals', args: [], transactionHashVariant: 'latest-final'}));
// The evidence set is exactly 6 cases / 60 GEN. Later live use (e.g. the
// browser write-loop test case, recorded separately in EVIDENCE.md) may
// add cases, so the aggregate check is: received == 60 GEN + 10 GEN per
// extra case, withdrawn == received, balance 0, escrow 0.
const all = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_all_cases', args: [], transactionHashVariant: 'latest-final'}));
const extraCases = all.length - 6;
const expectedReceived = 60000000000000000000 + 10000000000000000000 * extraCases;
check(`GEN accounting closes: ${expectedReceived / 1e18} GEN in = out, balance 0, escrow 0 (${extraCases} post-evidence case(s))`,
  totals.total_received_wei === expectedReceived
  && totals.total_withdrawn_wei === totals.total_received_wei
  && totals.contract_balance_wei === 0 && totals.escrowed_wei === 0,
  JSON.stringify(totals));
const expect = {
  1: ['SETTLED_ACCEPT', 'ACCEPT', 10000000000000000000, 0],
  2: ['SETTLED_PARTIAL', 'PARTIAL', 5000000000000000000, 5000000000000000000],
  3: ['SETTLED_REJECT', 'REJECT', 0, 10000000000000000000],
  4: ['CANCELLED', '', 0, 10000000000000000000],
  5: ['SETTLED_ACCEPT', 'ACCEPT', 10000000000000000000, 0],
  6: ['SETTLED_REJECT', 'REJECT', 0, 10000000000000000000],
};
for (const c of all) {
  const e = expect[c.case_id];
  if (!e) {
    console.log('NOTE post-evidence case ' + c.case_id + ' (not part of the evidence set): live=' + c.status + '/' + c.verdict);
    continue;
  }
  check(`case ${c.case_id} live status/verdict/credits == expected`,
    e && c.status === e[0] && c.verdict === e[1]
    && c.translator_credit === e[2] && c.client_credit === e[3],
    `live=${c.status}/${c.verdict}/${c.translator_credit}/${c.client_credit}`);
}
// Case 6 must not carry the injected verdict.
const c6 = all.find((c) => c.case_id === 6);
check('case 6 injection verdict is NOT the injected ACCEPT',
  !!c6 && c6.verdict === 'REJECT', 'verdict=' + (c6?.verdict || 'missing'));

console.log(`\nVERIFY: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
