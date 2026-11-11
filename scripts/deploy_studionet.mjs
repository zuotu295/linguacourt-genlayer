// LinguaCourt: deploy contracts/linguacourt.py on Stable Studionet (61999).
// Temp accounts live ONLY in the checkpoint file:
//   ~/workspace/build-linguacourt/.linguacourt-checkpoint.json
// (workspace, NOT in the repo, mode 0600, deleted when the flow is done
// or abandoned). No keys are written to the repo, logs, or evidence.
// Usage: node scripts/deploy_studionet.mjs [--checkpoint <path>]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createClient, createAccount, generatePrivateKey} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const RPC_URL = 'https://studio.genlayer.com/api';
const CHAIN_ID = 61999;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const CHECKPOINT = opt('--checkpoint', path.resolve(REPO, '..', '.linguacourt-checkpoint.json'));
const CONTRACT_PATH = path.join(REPO, 'contracts', 'linguacourt.py');
const DEPLOYMENT_PATH = path.join(REPO, 'evidence', 'deployment.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha256').update(s).digest('hex');

function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')); } catch { return {wallets: {}}; }
}
function saveCheckpoint(cp) {
  fs.mkdirSync(path.dirname(CHECKPOINT), {recursive: true});
  fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2), {mode: 0o600});
  fs.chmodSync(CHECKPOINT, 0o600);
}
function leaderExec(tx) {
  let r = tx.consensus_data?.leader_receipt;
  r = Array.isArray(r) ? r.find((x) => x.mode === 'leader') : r;
  return r?.execution_result;
}
function good(tx) {
  return [7, 'FINALIZED'].includes(tx.status)
    && [6, 'MAJORITY_AGREE'].includes(tx.result)
    && leaderExec(tx) === 'SUCCESS';
}
async function collect(client, hash, label) {
  console.log(label, hash);
  for (let i = 0; i < 40; i++) {
    try {
      const tx = await client.waitForTransactionReceipt({hash, status: 'FINALIZED', interval: 5000, retries: 12, fullTransaction: true});
      console.log(label, 'status=', tx.status, 'result=', tx.result, 'leader=', leaderExec(tx));
      return tx;
    } catch (e) {
      console.log('tracking', label, 'attempt', i, e.shortMessage || e.message);
      await sleep(5000);
    }
  }
  throw new Error('Timeout waiting for FINALIZED: ' + label + ' ' + hash + ' — keep the hash, do not redeploy.');
}

const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
console.log('contract source sha256:', sha(source), `(${Buffer.byteLength(source)} bytes)`);

const cp = loadCheckpoint();
for (const k of ['C1', 'C2', 'C3', 'T1', 'T2', 'T3', 'OUT']) {
  if (!cp.wallets[k]) { cp.wallets[k] = generatePrivateKey(); console.log('generated temp account', k); }
}
cp.chain_id = CHAIN_ID;
cp.rpc = RPC_URL;
saveCheckpoint(cp);

const accounts = {};
for (const k of Object.keys(cp.wallets)) accounts[k] = createAccount(cp.wallets[k]);
for (const k of Object.keys(accounts)) console.log(k, ':', accounts[k].address);

const deployer = createClient({chain: studionet, account: accounts.C1});
const chainId = await deployer.getChainId();
if (chainId !== CHAIN_ID) throw new Error('WRONG_CHAIN: ' + chainId);
console.log('chain OK:', chainId, RPC_URL);

// Fund every temp account with 100 GEN (testnet sim funding, zero cash cost).
for (const k of Object.keys(accounts)) {
  const bal = await deployer.getBalance({address: accounts[k].address});
  console.log(k, 'balance before fund:', bal.toString());
  if (bal < 50000000000000000000n) {
    await deployer.request({method: 'sim_fundAccount', params: [accounts[k].address, 100000000000000000000]});
    console.log(k, 'funded 100 GEN, balance now:', (await deployer.getBalance({address: accounts[k].address})).toString());
  }
}

let address = cp.contract_address || null;
let deployTx = cp.deploy_tx || null;
if (address && deployTx) {
  console.log('resuming existing deploy', address, deployTx);
  const tx = await collect(deployer, deployTx, 'deploy (resume)');
  if (!good(tx)) throw new Error('recorded deploy tx is not good; inspect before redeploying');
} else {
  await sleep(3000);
  const hash = await deployer.deployContract({code: source, args: [], value: 0n, leaderOnly: false});
  const tx = await collect(deployer, hash, 'deploy');
  if (!good(tx)) throw new Error('deploy failed: ' + JSON.stringify(tx));
  address = tx.data?.contract_address || tx.contract_address;
  if (!address) throw new Error('no contract address in deploy receipt');
  deployTx = hash;
  cp.contract_address = address;
  cp.deploy_tx = deployTx;
  saveCheckpoint(cp);
}

await sleep(3000);
const onChain = await deployer.getContractCode(address);
if (onChain !== source) throw new Error('BYTE_PARITY_MISMATCH after deploy');
console.log('BYTE_PARITY_MATCH: TRUE');

fs.mkdirSync(path.dirname(DEPLOYMENT_PATH), {recursive: true});
const deployment = {
  network: 'Stable Studionet',
  chain_id: CHAIN_ID,
  rpc: RPC_URL,
  contract_address: address,
  deploy_tx: deployTx,
  explorer: 'https://explorer-studio.genlayer.com/address/' + address,
  source_sha256: sha(source),
  source_bytes: Buffer.byteLength(source),
  source_file: 'contracts/linguacourt.py',
  byte_parity: 'BYTE_PARITY_MATCH: TRUE',
  fee_wei: '10000000000000000000',
  fee_gen: 10,
  wallets: Object.fromEntries(Object.entries(accounts).map(([k, a]) => [k, a.address.toLowerCase()])),
  note: 'Temp accounts generated for this evidence run only.',
};
fs.writeFileSync(DEPLOYMENT_PATH, JSON.stringify(deployment, null, 2));
console.log('deployed:', address);
console.log('deploy tx:', deployTx);
console.log('wrote', DEPLOYMENT_PATH);
