// LinguaCourt evidence run on Stable Studionet (61999).
// Runs the full evidence set: 3 cases (ACCEPT / PARTIAL / REJECT) + 6
// negative calls that must fail on-chain as contract_error with no state
// change. Every tx is waited to FINALIZED and checked; GEN accounting is
// verified exact at the end (30 GEN in = 30 GEN out, escrow 0).
// Disputes retry (max 3) only when consensus itself disagrees
// (MAJORITY_DISAGREE, state unchanged); a wrong verdict aborts loudly.
// Usage: node scripts/run_evidence.mjs [--checkpoint <path>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient, createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const CHAIN_ID = 61999;
const FEE = 10000000000000000000n;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const CHECKPOINT = opt('--checkpoint', path.resolve(REPO, '..', '.linguacourt-checkpoint.json'));
const EVIDENCE = path.join(REPO, 'evidence');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
const deployment = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'deployment.json'), 'utf8'));
const ADDRESS = deployment.contract_address;
const accounts = {};
for (const [k, pk] of Object.entries(cp.wallets)) accounts[k] = createAccount(pk);
const clients = {};
for (const [k, a] of Object.entries(accounts)) clients[k] = createClient({chain: studionet, account: a});
const reader = createClient({chain: studionet});
if ((await reader.getChainId()) !== CHAIN_ID) throw new Error('WRONG_CHAIN');

const steps = [];
function leaderExec(tx) {
  let r = tx.consensus_data?.leader_receipt;
  r = Array.isArray(r) ? r.find((x) => x.mode === 'leader') : r;
  return r;
}
function leaderPayload(tx) {
  const r = leaderExec(tx);
  if (!r) return '';
  if (r.result?.payload) return String(r.result.payload);
  if (typeof r.result?.raw === 'string') {
    try { return Buffer.from(r.result.raw, 'base64').toString(); } catch { return ''; }
  }
  return '';
}
async function collect(client, hash, label) {
  for (let i = 0; i < 60; i++) {
    try {
      const tx = await client.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 5000, retries: 12, fullTransaction: true});
      console.log(label, hash.slice(0, 18), 'status=', tx.status, 'result=', tx.result, 'leader=', leaderExec(tx)?.execution_result);
      return tx;
    } catch (e) {
      console.log('tracking', label, 'attempt', i, e.shortMessage || e.message);
      await sleep(5000);
    }
  }
  throw new Error('Timeout waiting for FINALIZED: ' + label + ' ' + hash);
}
async function write(role, fn, fnArgs, value = 0n) {
  await sleep(2000);
  return clients[role].writeContract({address: ADDRESS, functionName: fn, args: fnArgs, value, leaderOnly: false});
}
async function expectOk(role, fn, fnArgs, label, value = 0n) {
  const hash = await write(role, fn, fnArgs, value);
  const tx = await collect(clients[role], hash, label);
  const ok = [7, 'FINALIZED'].includes(tx.status) && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderExec(tx)?.execution_result === 'SUCCESS';
  steps.push({label, hash, outcome: ok ? 'ok' : 'UNEXPECTED', status: tx.status, result: tx.result, leader: leaderExec(tx)?.execution_result});
  if (!ok) throw new Error('Expected OK but got failure: ' + label + ' ' + hash + ' ' + JSON.stringify(tx.result));
  return tx;
}
async function expectError(role, fn, fnArgs, label, needle) {
  const hash = await write(role, fn, fnArgs);
  const tx = await collect(clients[role], hash, label);
  const payload = leaderPayload(tx);
  const ok = [7, 'FINALIZED'].includes(tx.status) && leaderExec(tx)?.execution_result === 'ERROR'
    && (!needle || payload.includes(needle));
  steps.push({label, hash, outcome: ok ? 'error-observed' : 'UNEXPECTED', status: tx.status, result: tx.result, leader: leaderExec(tx)?.execution_result, payload: payload.slice(0, 200)});
  if (!ok) throw new Error('Expected on-chain ERROR but got: ' + label + ' ' + hash + ' payload=' + payload.slice(0, 200));
  return tx;
}
async function readCase(id) {
  await sleep(2000);
  const raw = await reader.readContract({address: ADDRESS, functionName: 'get_case', args: [id], transactionHashVariant: 'latest-final'});
  return JSON.parse(raw);
}

const SRC1 = 'The museum opens at nine in the morning and closes at six in the evening. Admission is free on Sundays.';
const TR1 = 'El museo abre a las nueve de la mañana y cierra a las seis de la tarde. La entrada es gratuita los domingos.';
const SRC2 = 'The train leaves Paris at 8:15 and arrives in Lyon at 10:30. A standard ticket costs 25 euros.';
const TR2 = 'Le train part de Paris à 8h15 et arrive à Lyon à 10h30. Un billet standard coûte 52 euros.';
const SRC3 = 'Please water the plants twice a week and keep the cat indoors at night.';
const TR3 = "Veuillez arroser les plantes deux fois par semaine et garder le chat à l'intérieur la nuit.";

async function dispute(role, caseId, expectedVerdict, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const hash = await write(role, 'dispute_case', [caseId]);
    const tx = await collect(clients[role], hash, `${label} (attempt ${attempt})`);
    if ([6, 'MAJORITY_AGREE'].includes(tx.result) && leaderExec(tx)?.execution_result === 'SUCCESS') {
      steps.push({label, hash, outcome: 'ok', status: tx.status, result: tx.result, leader: 'SUCCESS', attempt});
      const c = await readCase(caseId);
      console.log(label, 'verdict on-chain:', c.verdict, '| reason:', c.reason);
      if (c.verdict !== expectedVerdict) {
        throw new Error(`WRONG VERDICT on ${label}: expected ${expectedVerdict}, got ${c.verdict} (${c.reason}). Case ${caseId} is settled; stop and inspect before any new case.`);
      }
      return c;
    }
    steps.push({label: `${label} (attempt ${attempt})`, hash, outcome: 'consensus-disagree-retry', status: tx.status, result: tx.result, leader: leaderExec(tx)?.execution_result});
    console.log(label, 'consensus did not agree (result=', tx.result, '); state must be unchanged — re-reading case');
    const c = await readCase(caseId);
    if (c.status !== 'SUBMITTED') throw new Error('State changed after a disagreed dispute — aborting, inspect manually.');
  }
  throw new Error('Dispute failed 3 consensus attempts: ' + label);
}

// ---- Case 1: ACCEPT (deterministic client accept) ----
await expectOk('C1', 'create_case', [SRC1, 'Spanish', 'Museum opening hours notice'], 'case1 create', FEE);
await expectError('C1', 'submit_translation', [1, TR1], 'neg1 client-submits-own', 'CLIENT_CANNOT_TRANSLATE_OWN_CASE');
await expectOk('T1', 'submit_translation', [1, TR1], 'case1 submit good Spanish');
await expectError('T1', 'submit_translation', [1, TR1], 'neg2 duplicate-submit', 'CASE_NOT_OPEN');
await expectError('OUT', 'accept_case', [1], 'neg3 outsider-accept', 'ONLY_CLIENT_CAN_ACCEPT');
await expectOk('C1', 'accept_case', [1], 'case1 accept');
await expectOk('T1', 'withdraw', [1], 'case1 translator withdraw 10 GEN');
await expectError('T1', 'withdraw', [1], 'neg5 double-withdraw', 'NO_CREDIT');

// ---- Case 2: PARTIAL (dispute; one material error: 25 -> 52 euros) ----
await expectOk('C2', 'create_case', [SRC2, 'French', 'Train timetable and fare'], 'case2 create', FEE);
await expectOk('T2', 'submit_translation', [2, TR2], 'case2 submit partial French');
await expectError('OUT', 'dispute_case', [2], 'neg4 outsider-dispute', 'ONLY_CLIENT_CAN_DISPUTE');
await dispute('C2', 2, 'PARTIAL', 'case2 dispute');
await expectOk('T2', 'withdraw', [2], 'case2 translator withdraw 5 GEN');
await expectOk('C2', 'withdraw', [2], 'case2 client withdraw 5 GEN');

// ---- Case 3: REJECT (dispute; translation in French, target is German) ----
await expectOk('C3', 'create_case', [SRC3, 'German', 'House-sitting instructions'], 'case3 create', FEE);
await expectOk('T3', 'submit_translation', [3, TR3], 'case3 submit wrong-language French');
await dispute('C3', 3, 'REJECT', 'case3 dispute');
await expectOk('C3', 'withdraw', [3], 'case3 client withdraw 10 GEN');
await expectError('T3', 'withdraw', [3], 'neg6 translator-no-credit-withdraw', 'NO_CREDIT');

// ---- Final readback: latest-final ----
await sleep(3000);
const totals = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_totals', args: [], transactionHashVariant: 'latest-final'}));
const all = JSON.parse(await reader.readContract({address: ADDRESS, functionName: 'get_all_cases', args: [], transactionHashVariant: 'latest-final'}));
console.log('TOTALS', JSON.stringify(totals));
console.log('CASES', JSON.stringify(all.map((c) => ({id: c.case_id, status: c.status, verdict: c.verdict, t_credit: c.translator_credit, c_credit: c.client_credit}))));
const accountingOk = totals.total_received_wei === 30000000000000000000
  && totals.total_withdrawn_wei === 30000000000000000000
  && totals.contract_balance_wei === 0
  && totals.escrowed_wei === 0;
console.log('ACCOUNTING 30 GEN in = 30 GEN out, escrow 0:', accountingOk);
if (!accountingOk) throw new Error('GEN accounting mismatch: ' + JSON.stringify(totals));

const out = {
  network: 'Stable Studionet', chain_id: CHAIN_ID, contract_address: ADDRESS,
  deploy_tx: deployment.deploy_tx, fee_gen: 10,
  steps, totals, cases: all,
  cases_summary: [
    {case_id: 1, expected: 'ACCEPT', actual: all[0]?.verdict, status: all[0]?.status},
    {case_id: 2, expected: 'PARTIAL', actual: all[1]?.verdict, status: all[1]?.status},
    {case_id: 3, expected: 'REJECT', actual: all[2]?.verdict, status: all[2]?.status},
  ],
  accounting_ok: accountingOk,
};
fs.mkdirSync(EVIDENCE, {recursive: true});
fs.writeFileSync(path.join(EVIDENCE, 'transactions.json'), JSON.stringify(out, null, 2));
console.log('EVIDENCE COMPLETE — ok steps:', steps.filter((s) => s.outcome === 'ok').length,
  '| error-observed:', steps.filter((s) => s.outcome === 'error-observed').length,
  '| total txs:', steps.length, '+ deploy =', steps.length + 1);
console.log('wrote evidence/transactions.json');
