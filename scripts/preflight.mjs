// Offline release checks only: no SDK client, keys, wallet or network access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = fs.readFileSync(path.join(root, 'contracts/linguacourt.py'));
const hash = createHash('sha256').update(bytes).digest('hex');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'evidence/v3/deployment.json')));
const web = JSON.parse(fs.readFileSync(path.join(root, 'public/deployment.json')));
function check(name, ok) { if (!ok) throw new Error('FAIL ' + name); console.log('PASS ' + name); }
check('source SHA-256 and byte count', plan.source_sha256 === hash && plan.source_bytes === bytes.length);
check('Stable Studionet only', plan.chain_id === 61999 && plan.rpc === 'https://studio.genlayer.com/api');
check('protocol and fixed review period', plan.protocol === 'linguacourt-3' && plan.review_period_seconds === 86400);
check('frontend uses matching manifest', JSON.stringify(web) === JSON.stringify(plan));
check('pending release has no recycled address or receipt', plan.status !== 'awaiting_deployment' || (!plan.contract_address && !plan.deploy_tx));
const old = JSON.parse(fs.readFileSync(path.join(root, 'evidence/v2/deployment.json')));
const oldBytes = fs.readFileSync(path.join(root, 'evidence/v2/linguacourt.py'));
check('historical v2 exact source retained', createHash('sha256').update(oldBytes).digest('hex') === old.source_sha256);
for (const file of ['deploy_studionet.mjs', 'run_evidence.mjs', 'verify_evidence.mjs', 'capture_readback.mjs', 'rpc_journal.mjs']) {
  execFileSync(process.execPath, ['--check', path.join(root, 'scripts', file)]);
  console.log('PASS syntax ' + file);
}
console.log('OFFLINE_PREFLIGHT_OK: ' + hash + '; runtime/chain execution NOT verified');
