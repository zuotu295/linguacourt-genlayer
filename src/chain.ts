// LinguaCourt chain layer — GenLayer Stable Studionet only (Chain ID 61999).
// Reads are pinned to latest-final. Writes go through an injected EVM
// wallet (OKX first) or a labelled in-browser ephemeral test account.
// Formal escrow funding (create_case) REQUIRES a persistent wallet:
// a temporary test account is blocked from create_case by the UI layer
// (see App.tsx) and must never be used to fund escrow.
// No private keys are ever written to disk or sent anywhere; the temp key
// lives in this tab's sessionStorage only, and is shown to the user once
// with copy/export + an explicit "I saved my key" acknowledgement.
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { TransactionHashVariant, TransactionStatus, type Hash } from 'genlayer-js/types';
import { studionet } from 'genlayer-js/chains';

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = '0xf22f';
export const RPC_URL = 'https://studio.genlayer.com/api';
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';
export const FEE_WEI = 10000000000000000000n; // fixed escrow: 10 GEN
export const TARGET_LANGS = ['Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Italian', 'Korean'];

export interface Deployment { protocol: string; status?: string; contract_address: string; deploy_tx: string; source_sha256: string; network: string; chain_id: number }
export let DEPLOYMENT: Deployment | null = null;
export async function loadDeployment(): Promise<Deployment> {
  const res = await fetch('./deployment.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('deployment.json not served (' + res.status + ')');
  const candidate = (await res.json()) as Deployment;
  if (candidate.status === 'awaiting_deployment') throw new Error('LinguaCourt v3 awaits deployment; historical v2 is not the brief/review-period release. / v3 尚未部署，旧地址不代表本次修复。');
  if (candidate.chain_id !== CHAIN_ID || candidate.protocol !== 'linguacourt-3') throw new Error('candidate_VERSION_OR_CHAIN_MISMATCH');
  if (!/^0x[0-9a-fA-F]{40}$/.test(candidate.contract_address || '')) {
    throw new Error('deployment.json has no valid contract_address');
  }
  const protocol = await reader.readContract({ address: candidate.contract_address as `0x${string}`, functionName: 'get_protocol', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  if (protocol !== 'linguacourt-3') throw new Error('LIVE_PROTOCOL_MISMATCH');
  DEPLOYMENT = candidate;
  return candidate;
}
export const contractAddress = () => DEPLOYMENT!.contract_address as `0x${string}`;
export const explorerTx = (h: string) => EXPLORER_BASE + '/tx/' + h;
export const explorerAddress = (a: string) => EXPLORER_BASE + '/address/' + a;

export const reader = createClient({ chain: studionet });

export interface CaseRec {
  case_id: number; client: string; translator: string; source_text: string;
  target_lang: string; brief: string; fee_wei: number; translation: string;
  submitted_at: number; review_deadline: number; review_period_seconds: number;
  status: string; verdict: string; reason: string;
  translator_credit: number; client_credit: number;
  translator_withdrawn: boolean; client_withdrawn: boolean;
}
export interface Totals { total_received_wei: number; total_withdrawn_wei: number; contract_balance_wei: number; escrowed_wei: number; case_count: number }

// The finalized flag is derived inside these functions from a real
// latest-final read returning data — never assigned by a caller.
// `at` is the wall-clock time THIS latest-final readback completed, in
// ISO form. It is NOT an on-chain finalization timestamp (Studionet
// exposes no block timestamp to the UI); the UI labels it as a readback
// time, never as "finalized at" a chain time.
function requireJsonString(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('CONTRACT_RETURN_NOT_JSON_STRING');
  return raw;
}
export async function readAllCases(): Promise<{ cases: CaseRec[]; is_finalized_readback: boolean; at: string }> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_all_cases', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  const data = JSON.parse(requireJsonString(raw)) as CaseRec[];
  return { cases: data, is_finalized_readback: typeof raw === 'string' && raw.length > 2 && Array.isArray(data), at: new Date().toISOString() };
}
export async function readTotals(): Promise<Totals> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_totals', args: [], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return JSON.parse(requireJsonString(raw)) as Totals;
}
export async function readCase(id: number): Promise<CaseRec> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_case', args: [id], transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return JSON.parse(requireJsonString(raw)) as CaseRec;
}

// ---- Tx lifecycle: hash saved immediately, timeout is "unknown" ----
// A tx that times out while polling is NOT a failure: its on-chain
// outcome is unknown, so the hash is kept in localStorage and polling
// resumes (including after a page refresh) until FINALIZED is observed.
export interface PendingTx { hash: string; label: string; savedAt: string }
const PENDING_KEY = 'linguacourt-pending-txs';
export function savePendingTx(hash: string, label: string) {
  try {
    const list: PendingTx[] = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (!list.some((p) => p.hash === hash)) list.push({ hash, label, savedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch { /* storage unavailable: hash is still shown on screen */ }
}
export function loadPendingTxs(): PendingTx[] {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
}
export function clearPendingTx(hash: string) {
  try {
    const list: PendingTx[] = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.filter((p) => p.hash !== hash)));
  } catch { /* ignore */ }
}

export class TxUnknownError extends Error {
  hash: string;
  constructor(hash: string) {
    super('TX_UNKNOWN: sent but not yet FINALIZED — outcome unknown, still polling');
    this.hash = hash;
  }
}

export async function waitFinalized(hash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('INVALID_TX_HASH');
  try {
    // genlayer-js 1.1.8 implements fullTransaction but omits it from its declaration.
    const request = { hash: hash as Hash, status: TransactionStatus.FINALIZED, interval: 3000, retries: 40, fullTransaction: true };
    return await reader.waitForTransactionReceipt(request);
  } catch {
    throw new TxUnknownError(hash);
  }
}
export function leaderReceipt(tx: any) {
  let r = tx?.consensus_data?.leader_receipt;
  if (Array.isArray(r)) r = r.find((x: any) => x.mode === 'leader');
  return r || null;
}
export function leaderExecution(tx: any) { return leaderReceipt(tx)?.execution_result || null; }
export function leaderPayload(tx: any) {
  const r = leaderReceipt(tx);
  if (!r) return '';
  if (r.result?.payload) return String(r.result.payload);
  if (typeof r.result?.raw === 'string') {
    try { return new TextDecoder().decode(Uint8Array.from(atob(r.result.raw), c => c.charCodeAt(0))); } catch { return ''; }
  }
  return '';
}
export function txGood(tx: any) {
  return [7, 'FINALIZED'].includes(tx.status) && [6, 'MAJORITY_AGREE'].includes(tx.result) && leaderExecution(tx) === 'SUCCESS';
}

export function injectedProvider(): any {
  if ((window as any).okxwallet?.ethereum?.request) return (window as any).okxwallet.ethereum;
  if ((window as any).okxwallet?.request) return (window as any).okxwallet;
  if ((window as any).ethereum?.request) return (window as any).ethereum;
  return null;
}
export function walletKind(): string {
  if ((window as any).okxwallet?.ethereum) return 'OKX Wallet';
  if ((window as any).ethereum?.isMetaMask) return 'MetaMask';
  if ((window as any).ethereum) return 'Injected wallet';
  return 'No injected wallet detected';
}

async function switchToStudionet(provider: any) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (e: any) {
    // 4902 = chain not added yet; add it, then switch again.
    if (e?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX, chainName: 'GenLayer Studionet', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER_BASE] }],
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } else { throw e; }
  }
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (Number(chainId) !== CHAIN_ID) throw new Error('WRONG_CHAIN_AFTER_SWITCH: ' + String(chainId));
}

export interface Wallet { mode: 'injected' | 'temporary'; address: string; client: any; signer_mode: string; provider?: any }
export async function connectInjected(): Promise<Wallet> {
  const provider = injectedProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  await switchToStudionet(provider);
  const address = String(accounts[0]).toLowerCase();
  const client = createClient({ chain: studionet, provider, account: address as `0x${string}` });
  return { mode: 'injected', address, provider, client, signer_mode: 'INJECTED_WALLET' };
}
// Verify the injected wallet is still on Studionet before a write;
// block the write (throw) until the chain is correct.
export async function ensureInjectedChain(wallet: Wallet) {
  if (wallet.mode !== 'injected' || !wallet.provider) return;
  const chainId = await wallet.provider.request({ method: 'eth_chainId' });
  if (Number(chainId) !== CHAIN_ID) {
    await switchToStudionet(wallet.provider);
  }
}

const TEMP_KEY = 'linguacourt-temp-private-key';
const TEMP_ACK = 'linguacourt-temp-key-acked';
export function tempPrivateKey(): string | null {
  try { return sessionStorage.getItem(TEMP_KEY); } catch { return null; }
}
export function isTempKeyAcked(): boolean {
  try { return sessionStorage.getItem(TEMP_ACK) === 'yes'; } catch { return false; }
}
export function ackTempKey() {
  try { sessionStorage.setItem(TEMP_ACK, 'yes'); } catch { /* ignore */ }
}
export async function temporaryAccount(): Promise<Wallet> {
  let pk: string | null = null;
  try { pk = sessionStorage.getItem(TEMP_KEY); } catch { /* ignore */ }
  if (!pk) {
    pk = generatePrivateKey();
    try { sessionStorage.setItem(TEMP_KEY, pk); } catch { /* ignore */ }
  }
  const account = createAccount(pk as `0x${string}`);
  const client = createClient({ chain: studionet, account });
  // Testnet sim funding (free test GEN, zero cash cost) so the temp
  // account can act on cases it is designated for. Temp accounts are
  // BLOCKED from create_case (escrow funding) by the UI.
  try {
    const bal = await client.getBalance({ address: account.address });
    if (bal < 20000000000000000000n) {
      await client.request({ method: 'sim_fundAccount', params: [account.address, 100000000000000000000] });
    }
  } catch { /* funding is best-effort; writes will surface any shortfall */ }
  return { mode: 'temporary', address: String(account.address).toLowerCase(), client, signer_mode: 'BROWSER_EPHEMERAL_TEST_ACCOUNT' };
}
export function rotateTemporaryAccount() {
  try { sessionStorage.removeItem(TEMP_KEY); sessionStorage.removeItem(TEMP_ACK); } catch { /* ignore */ }
  return temporaryAccount();
}
export function destroyTemporaryAccount() {
  try { sessionStorage.removeItem(TEMP_KEY); sessionStorage.removeItem(TEMP_ACK); } catch { /* ignore */ }
}

// Send only: returns the hash immediately (caller must save it before
// waiting). Waiting is separate so a timeout never loses the hash.
export async function sendWriteOnly(wallet: Wallet, functionName: string, args: any[], value = 0n) {
  if (!DEPLOYMENT || DEPLOYMENT.protocol !== 'linguacourt-3' || DEPLOYMENT.status === 'awaiting_deployment') throw new Error('V3_NOT_DEPLOYED');
  if (!wallet?.client) throw new Error('NO_SIGNER');
  await ensureInjectedChain(wallet);
  const hash = await wallet.client.writeContract({ address: contractAddress(), functionName, args, value, leaderOnly: false });
  return hash as string;
}
export async function sendWrite(wallet: Wallet, functionName: string, args: any[], value = 0n) {
  const hash = await sendWriteOnly(wallet, functionName, args, value);
  const receipt = await waitFinalized(hash);
  return { hash, receipt };
}

export const shortAddr = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');
export const gen = (wei: number) => (wei / 1e18).toString();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Format a readback-completion time with an explicit timezone, so the
// label can never be read as a chain finalization time.
export const fmtReadbackTime = (iso: string) => {
  try { return new Date(iso).toLocaleString(undefined, { timeZoneName: 'short' }); } catch { return iso; }
};
