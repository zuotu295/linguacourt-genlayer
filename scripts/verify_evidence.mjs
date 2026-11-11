// One-command independent verification for LinguaCourt v2.
// Re-reads everything live from Studionet and compares against
// evidence/transactions.json and EXPECTED.md. No wallet, no
// transactions, no writes.
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
    check(`${s.label} FINALIZED + leader ERROR`,
      [7, 'FINALIZED'].includes(tx.status) && leaderRec(tx)?.execution_result === 'ERROR',
      s.hash.slice(0, 18) + ' payload=' + leaderPayload(tx).slice(0, 80));
  } else {
    check(`${s.label} recorded outcome ${s.outcome} re-read FINALIZED`,
      [7, 'FINALIZED'].includes(tx.status), s.hash.slice(0, 18));
  }
}

await sleep(3000);
const totals = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_totals', args: [], transactionHashVariant: 'latest-final'}));
check('GEN accounting: 60 GEN in = 60 GEN out, balance 0, escrow 0',
  totals.total_received_wei === 60000000000000000000
  && totals.total_withdrawn_wei === 60000000000000000000
  && totals.contract_balance_wei === 0 && totals.escrowed_wei === 0,
  JSON.stringify(totals));
const all = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_all_cases', args: [], transactionHashVariant: 'latest-final'}));
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
