// LinguaCourt chain layer — GenLayer Stable Studionet only (Chain ID 61999).
// Reads are pinned to latest-final. Writes go through an injected EVM
// wallet (OKX first) or a labelled in-browser ephemeral test account.
// No private keys are ever written to disk or sent anywhere; the temp key
// lives in this tab's sessionStorage only.
import { createClient, createAccount, generatePrivateKey } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = '0xf22f';
export const RPC_URL = 'https://studio.genlayer.com/api';
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com';
export const FEE_WEI = 10000000000000000000n; // fixed escrow: 10 GEN
export const TARGET_LANGS = ['Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Italian', 'Korean'];

export interface Deployment { contract_address: string; deploy_tx: string; source_sha256: string; network: string; chain_id: number }
export let DEPLOYMENT: Deployment | null = null;
export async function loadDeployment(): Promise<Deployment> {
  const res = await fetch('./deployment.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('deployment.json not served (' + res.status + ')');
  DEPLOYMENT = (await res.json()) as Deployment;
  if (!/^0x[0-9a-fA-F]{40}$/.test(DEPLOYMENT.contract_address || '')) {
    throw new Error('deployment.json has no valid contract_address');
  }
  return DEPLOYMENT;
}
export const contractAddress = () => DEPLOYMENT!.contract_address;
export const explorerTx = (h: string) => EXPLORER_BASE + '/tx/' + h;
export const explorerAddress = (a: string) => EXPLORER_BASE + '/address/' + a;

export const reader = createClient({ chain: studionet });

export interface CaseRec {
  case_id: number; client: string; translator: string; source_text: string;
  target_lang: string; brief: string; fee_wei: number; translation: string;
  status: string; verdict: string; reason: string;
  translator_credit: number; client_credit: number;
  translator_withdrawn: boolean; client_withdrawn: boolean;
}
export interface Totals { total_received_wei: number; total_withdrawn_wei: number; contract_balance_wei: number; escrowed_wei: number; case_count: number }

// The finalized flag is derived inside these functions from a real
// latest-final read returning data — never assigned by a caller.
export async function readAllCases(): Promise<{ cases: CaseRec[]; is_finalized_readback: boolean; at: string }> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_all_cases', args: [], transactionHashVariant: 'latest-final' });
  const data = JSON.parse(raw) as CaseRec[];
  return { cases: data, is_finalized_readback: typeof raw === 'string' && raw.length > 2 && Array.isArray(data), at: new Date().toISOString() };
}
export async function readTotals(): Promise<Totals> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_totals', args: [], transactionHashVariant: 'latest-final' });
  return JSON.parse(raw) as Totals;
}
export async function readCase(id: number): Promise<CaseRec> {
  const raw = await reader.readContract({ address: contractAddress(), functionName: 'get_case', args: [id], transactionHashVariant: 'latest-final' });
  return JSON.parse(raw) as CaseRec;
}

export async function waitFinalized(hash: string) {
  return reader.waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 3000, retries: 40, fullTransaction: true });
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
    try { return Buffer.from(r.result.raw, 'base64').toString(); } catch { return ''; }
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

export interface Wallet { mode: 'injected' | 'temporary'; address: string; client: any; signer_mode: string; provider?: any }
export async function connectInjected(): Promise<Wallet> {
  const provider = injectedProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (Number(chainId) !== CHAIN_ID) {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX, chainName: 'GenLayer Studionet', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER_BASE] }],
    });
  }
  const address = String(accounts[0]).toLowerCase();
  const client = createClient({ chain: studionet, provider, account: address });
  return { mode: 'injected', address, provider, client, signer_mode: 'INJECTED_WALLET' };
}

const TEMP_KEY = 'linguacourt-temp-private-key';
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
  // account can escrow the 10 GEN fee.
  try {
    const bal = await client.getBalance({ address: account.address });
    if (bal < 20000000000000000000n) {
      await client.request({ method: 'sim_fundAccount', params: [account.address, 100000000000000000000] });
    }
  } catch { /* funding is best-effort; writes will surface any shortfall */ }
  return { mode: 'temporary', address: String(account.address).toLowerCase(), client, signer_mode: 'BROWSER_EPHEMERAL_TEST_ACCOUNT' };
}
export function rotateTemporaryAccount() {
  try { sessionStorage.removeItem(TEMP_KEY); } catch { /* ignore */ }
  return temporaryAccount();
}
export function destroyTemporaryAccount() {
  try { sessionStorage.removeItem(TEMP_KEY); } catch { /* ignore */ }
}

export async function sendWrite(wallet: Wallet, functionName: string, args: any[], value = 0n) {
  if (!wallet?.client) throw new Error('NO_SIGNER');
  const hash = await wallet.client.writeContract({ address: contractAddress(), functionName, args, value, leaderOnly: false });
  const receipt = await waitFinalized(hash);
  return { hash, receipt };
}

export const shortAddr = (a: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');
export const gen = (wei: number) => (wei / 1e18).toString();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
