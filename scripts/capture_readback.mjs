// Read-only latest-final evidence snapshot. Does not create accounts or transactions.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
const root = new URL('../', import.meta.url);
const dir = new URL('evidence/v3/', root);
const deployment = JSON.parse(fs.readFileSync(new URL('deployment.json', dir)));
if (!deployment.contract_address) throw new Error('V3_NOT_DEPLOYED');
const reader = createClient({chain:studionet});
const address = deployment.contract_address;
const read = functionName => reader.readContract({address,functionName,args:[],transactionHashVariant:'latest-final'});
const [chainId, code, protocol, rawCases, rawTotals] = await Promise.all([
  reader.getChainId(),reader.getContractCode(address),read('get_protocol'),read('get_all_cases'),read('get_totals')
]);
const source = fs.readFileSync(new URL('contracts/linguacourt.py',root),'utf8');
const sha = createHash('sha256').update(source).digest('hex');
if (chainId !== 61999 || protocol !== 'linguacourt-3' || code !== source || sha !== deployment.source_sha256) throw new Error('DEPLOYMENT_MISMATCH');
const cases=JSON.parse(rawCases), totals=JSON.parse(rawTotals);
const out = {network:'Stable Studionet',chain_id:chainId,contract_address:address,protocol,source_sha256:sha,source_byte_parity:true,readback_at:new Date().toISOString(),read_variant:'latest-final',note:'Independent finalized reads, not an atomic multi-method snapshot; unsettled cases are not passing settlement evidence.',cases,totals};
fs.writeFileSync(new URL('latest-readback.json',dir),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({protocol,case_count:cases.length,states:cases.map(c=>({id:c.case_id,status:c.status,verdict:c.verdict,review_deadline:c.review_deadline})),totals}));
