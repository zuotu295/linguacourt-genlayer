import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CHAIN_ID, FEE_WEI, TARGET_LANGS, loadDeployment, DEPLOYMENT, contractAddress,
  explorerTx, explorerAddress, reader, readAllCases, readTotals, readCase,
  sendWrite, waitFinalized, txGood, leaderExecution, leaderPayload,
  connectInjected, temporaryAccount, rotateTemporaryAccount, destroyTemporaryAccount,
  walletKind, shortAddr, gen, type CaseRec, type Totals, type Wallet,
} from './chain';
import { t, type Lang } from './i18n';

interface TxTrack { label: string; hash: string; stage: 'sent' | 'finalized-ok' | 'failed'; receipt?: any; error?: string }

const VERDICT_CLASS: Record<string, string> = { ACCEPT: 'v-accept', PARTIAL: 'v-partial', REJECT: 'v-reject' };

export default function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [dep, setDep] = useState<typeof DEPLOYMENT>(null);
  const [cases, setCases] = useState<CaseRec[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [readback, setReadback] = useState<{ done: boolean; at: string }>({ done: false, at: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [tx, setTx] = useState<TxTrack | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  const [src, setSrc] = useState('');
  const [target, setTarget] = useState('Spanish');
  const [brief, setBrief] = useState('');
  const [trText, setTrText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await readAllCases();
      setCases(r.cases);
      setReadback({ done: r.is_finalized_readback, at: r.at });
      setTotals(await readTotals());
      setLoadError('');
    } catch (e: any) {
      setLoadError(e?.shortMessage || e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setDep(await loadDeployment());
        await refresh();
      } catch (e: any) {
        setLoadError(e?.message || String(e));
      } finally { setLoading(false); }
    })();
  }, [refresh]);

  const sel = useMemo(() => cases.find((c) => c.case_id === selected) || null, [cases, selected]);

  async function doWrite(label: string, fn: string, args: any[], value = 0n) {
    if (!wallet) { setNotice(t('notConnected', lang)); return null; }
    setBusy(label);
    setNotice('');
    setTx({ label, hash: '', stage: 'sent' });
    try {
      const { hash, receipt } = await sendWrite(wallet, fn, args, value);
      const ok = txGood(receipt);
      setTx({ label, hash, stage: ok ? 'finalized-ok' : 'failed', receipt, error: ok ? '' : leaderPayload(receipt) });
      await refresh();
      return ok ? receipt : null;
    } catch (e: any) {
      setTx({ label, hash: '', stage: 'failed', error: e?.shortMessage || e?.message || String(e) });
      return null;
    } finally { setBusy(''); }
  }

  async function onConnect() {
    setWalletBusy(true);
    try { setWallet(await connectInjected()); }
    catch (e: any) { setNotice('Wallet connect failed: ' + (e?.message || String(e))); }
    finally { setWalletBusy(false); }
  }
  async function onTemp() {
    setWalletBusy(true);
    try { setWallet(await temporaryAccount()); }
    catch (e: any) { setNotice('Temporary account failed: ' + (e?.message || String(e))); }
    finally { setWalletBusy(false); }
  }
  async function onRotate() {
    setWalletBusy(true);
    try { setWallet(await rotateTemporaryAccount()); }
    catch (e: any) { setNotice(String(e?.message || e)); }
    finally { setWalletBusy(false); }
  }
  function onDisconnect() { destroyTemporaryAccount(); setWallet(null); }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) { setNotice(t('notConnected', lang)); return; }
    if (src.trim().length < 20) { setNotice('Source text must be 20–2000 characters. / 原文需 20–2000 字。'); return; }
    const r = await doWrite(t('createTitle', lang), 'create_case', [src.trim(), target, brief.trim()], FEE_WEI);
    if (r) { setSrc(''); setBrief(''); }
  }
  async function onSubmitTr(c: CaseRec) {
    if (trText.trim().length < 10) { setNotice('Translation must be 10–2000 characters. / 译文需 10–2000 字。'); return; }
    const r = await doWrite(t('submitTr', lang), 'submit_translation', [c.case_id, trText.trim()]);
    if (r) setTrText('');
  }
  async function onWithdraw(c: CaseRec) {
    if (!wallet) return;
    await doWrite(t('withdraw', lang), 'withdraw', [c.case_id]);
  }
  function exportDossier(c: CaseRec) {
    if (!readback.done) return;
    const dossier = {
      product: 'LinguaCourt', protocol: 'linguacourt-1', network: 'Stable Studionet', chain_id: CHAIN_ID,
      contract_address: contractAddress(), explorer: explorerAddress(contractAddress()),
      signer_mode: wallet?.signer_mode || 'READ_ONLY', readback_finalized_at: readback.at, case: c, totals,
    };
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linguacourt-case-${c.case_id}-dossier.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const me = wallet?.address || '';
  const canAct = (c: CaseRec) => me && c.status === 'SUBMITTED' && c.client === me;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">¶</span>
          <span className="brand-name">LinguaCourt <em>译审庭</em></span>
          <span className="brand-sub">{t('tagline', lang)}</span>
        </div>
        <div className="top-actions">
          <span className="net">● STUDIONET 61999</span>
          <button className="btn ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang === 'zh' ? 'EN' : '中文'}</button>
          {wallet ? (
            <span className="wallet-chip">
              {t('connectedAs', lang)} {wallet.mode === 'temporary' ? '🧪 ' : ''}{shortAddr(wallet.address)}
              {wallet.mode === 'temporary' && <button className="mini" onClick={onRotate}>{t('rotate', lang)}</button>}
              <button className="mini" onClick={onDisconnect}>{t('disconnect', lang)}</button>
            </span>
          ) : (
            <>
              <button className="btn" onClick={onConnect} disabled={walletBusy}>{t('connect', lang)} · {walletKind()}</button>
              <button className="btn ghost" onClick={onTemp} disabled={walletBusy}>{t('useTemp', lang)}</button>
            </>
          )}
        </div>
      </header>

      {wallet?.mode === 'temporary' && <div className="temp-banner">🧪 {t('tempNote', lang)} — {wallet.address}</div>}
      {!wallet && <div className="temp-banner neutral">{t('notConnected', lang)}</div>}
      {notice && <div className="notice">{notice}</div>}

      <main className="wrap">
        <section className="hero">
          <div className="hero-text">
            <p className="kicker">GENLAYER · STABLE STUDIONET · 61999</p>
            <h1>{t('heroTitle', lang).split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</h1>
            <p className="lede">{t('heroSub', lang)}</p>
            <p className="verdict-line"><b>ACCEPT</b> 100% <span className="red-mark">✓</span> · <b>PARTIAL</b> 50–50 · <b>REJECT</b> 100% refund</p>
          </div>
          <div className="hero-margin">
            <div className="margin-note red">✎ {t('verdictExpl', lang)}</div>
            <div className="margin-note blue">§ 1 — {t('step1', lang)}</div>
            <div className="margin-note blue">§ 2 — {t('step2', lang)}</div>
            <div className="margin-note blue">§ 3 — {t('step3', lang)}</div>
            <div className="margin-note blue">§ 4 — {t('step4', lang)}</div>
            <div className="proof-stamp">LINGUA<br />COURT<br />✓ VERDICT</div>
          </div>
        </section>

        <section className="strip" aria-label="totals">
          <div><span>{t('escrowed', lang)}</span><b>{totals ? gen(totals.escrowed_wei) + ' GEN' : '—'}</b></div>
          <div><span>{t('received', lang)}</span><b>{totals ? gen(totals.total_received_wei) + ' GEN' : '—'}</b></div>
          <div><span>{t('withdrawn', lang)}</span><b>{totals ? gen(totals.total_withdrawn_wei) + ' GEN' : '—'}</b></div>
          <div><span>{t('balance', lang)}</span><b>{totals ? gen(totals.contract_balance_wei) + ' GEN' : '—'}</b></div>
          <div><span>{t('docket', lang)}</span><b>{totals ? String(totals.case_count) : '—'}</b></div>
          <div className="finalized-cell">
            <span>{readback.done ? t('finalizedAt', lang) : t('unconfirmed', lang)}</span>
            <b>{readback.done ? new Date(readback.at).toLocaleString() : '—'}</b>
          </div>
        </section>

        {tx && (
          <section className={`tx-track ${tx.stage}`}>
            <b>{t('txProgress', lang)} · {tx.label}</b>
            {tx.stage === 'sent' && <p>⏳ {t('sent', lang)}</p>}
            {tx.stage === 'finalized-ok' && <p>✅ {t('finalizedOk', lang)} · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{tx.hash.slice(0, 18)}… {t('viewExplorer', lang)}</a></p>}
            {tx.stage === 'failed' && <p>❌ {t('txFailed', lang)}{tx.hash ? <> · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{t('viewExplorer', lang)}</a></> : ''}{tx.error ? <code> {tx.error.slice(0, 200)}</code> : ''}</p>}
          </section>
        )}

        <div className="cols">
          <section className="panel paper">
            <h2>{t('createTitle', lang)}</h2>
            <form onSubmit={onCreate}>
              <label>{t('sourceLabel', lang)}
                <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder={t('sourcePh', lang)} rows={4} required />
              </label>
              <div className="row">
                <label>{t('targetLabel', lang)}
                  <select value={target} onChange={(e) => setTarget(e.target.value)}>
                    {TARGET_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label>{t('briefLabel', lang)}
                  <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t('briefPh', lang)} maxLength={500} />
                </label>
              </div>
              <p className="fee-note">{t('feeNote', lang)}</p>
              <button className="btn primary" type="submit" disabled={!!busy || !wallet}>{busy ? '⏳ …' : t('createBtn', lang)}</button>
              {!wallet && <p className="hint">{t('notConnected', lang)}</p>}
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('docket', lang)}</h2>
              <button className="btn ghost" onClick={refresh}>{t('refresh', lang)}</button>
            </div>
            {loading && <p className="muted">{t('unconfirmed', lang)}</p>}
            {loadError && <p className="notice">Readback failed: {loadError}</p>}
            {!loading && !readback.done && <p className="notice">{t('unconfirmed', lang)}</p>}
            {readback.done && cases.length === 0 && <p className="muted">{t('noCases', lang)}</p>}
            <ul className="docket">
              {cases.map((c) => (
                <li key={c.case_id} className={selected === c.case_id ? 'sel' : ''}>
                  <button className="case-row" onClick={() => { setSelected(c.case_id); setTrText(''); }}>
                    <span className="case-no">#{c.case_id}</span>
                    <span className="case-src">{c.source_text.slice(0, 72)}{c.source_text.length > 72 ? '…' : ''}</span>
                    <span className="case-lang">{c.target_lang}</span>
                    <span className={`status ${c.status}`}>{c.status}</span>
                    {c.verdict && <span className={`verdict ${VERDICT_CLASS[c.verdict] || ''}`}>{c.verdict}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {sel && (
              <div className="case-detail paper">
                <h3>Case #{sel.case_id} · {sel.target_lang} · <span className={`status ${sel.status}`}>{sel.status}</span></h3>
                <dl>
                  <dt>Source / 原文</dt><dd>{sel.source_text}</dd>
                  <dt>Brief / 简述</dt><dd>{sel.brief || '—'}</dd>
                  <dt>{t('client', lang)}</dt><dd className="mono">{sel.client}</dd>
                  <dt>{t('translator', lang)}</dt><dd className="mono">{sel.translator || '—'}</dd>
                  <dt>{t('translationLabel', lang)}</dt><dd>{sel.translation || '—'}</dd>
                  {sel.verdict && <><dt>{t('verdict', lang)}</dt><dd><b className={VERDICT_CLASS[sel.verdict] || ''}>{sel.verdict}</b></dd>
                  <dt>{t('reason', lang)}</dt><dd>{sel.reason}</dd></>}
                  <dt>Credits</dt><dd>Translator {gen(sel.translator_credit)} GEN · Client {gen(sel.client_credit)} GEN</dd>
                </dl>
                {sel.status === 'OPEN' && (
                  <div className="actions">
                    <textarea value={trText} onChange={(e) => setTrText(e.target.value)} placeholder={t('translationPh', lang)} rows={3} />
                    <button className="btn primary" onClick={() => onSubmitTr(sel)} disabled={!!busy || !wallet}>{t('submitTr', lang)}</button>
                    {me && me === sel.client && <p className="hint">The client cannot translate their own case. / 客户不能翻译自己的案件。</p>}
                  </div>
                )}
                {sel.status === 'SUBMITTED' && canAct(sel) && (
                  <div className="actions">
                    <button className="btn primary" onClick={() => doWrite(t('accept', lang), 'accept_case', [sel.case_id])} disabled={!!busy}>{t('accept', lang)}</button>
                    <button className="btn danger" onClick={() => doWrite(t('dispute', lang), 'dispute_case', [sel.case_id])} disabled={!!busy}>{t('dispute', lang)}</button>
                  </div>
                )}
                {sel.status === 'SUBMITTED' && me && !canAct(sel) && <p className="hint">Only the case client can accept or dispute. / 只有案件客户可以接受或提交争议。</p>}
                {sel.status.startsWith('SETTLED') && (
                  <div className="actions">
                    {me === sel.translator && sel.translator_credit > 0 && !sel.translator_withdrawn && (
                      <button className="btn primary" onClick={() => onWithdraw(sel)} disabled={!!busy}>{t('withdrawT', lang)} · {gen(sel.translator_credit)} GEN</button>)}
                    {me === sel.client && sel.client_credit > 0 && !sel.client_withdrawn && (
                      <button className="btn primary" onClick={() => onWithdraw(sel)} disabled={!!busy}>{t('withdrawC', lang)} · {gen(sel.client_credit)} GEN</button>)}
                    {((me === sel.translator && (sel.translator_credit === 0 || sel.translator_withdrawn)) || (me === sel.client && (sel.client_credit === 0 || sel.client_withdrawn))) && <p className="hint">Nothing to withdraw for this account on this case. / 此账户在本案无可提现金额。</p>}
                  </div>
                )}
                <button className="btn ghost" onClick={() => exportDossier(sel)} disabled={!readback.done} title={readback.done ? '' : t('exportGated', lang)}>{t('export', lang)}</button>
                {!readback.done && <p className="hint">{t('exportGated', lang)}</p>}
              </div>
            )}
          </section>
        </div>

        <section className="panel evidence-panel">
          <h2>{t('evidence', lang)}</h2>
          <p>{t('evidenceText', lang)}</p>
          <p className="mono small">Contract · {dep ? dep.contract_address : '—'}</p>
        </section>
      </main>

      <footer className="site">
        <div className="wrap">
          <p><b>LinguaCourt 译审庭</b> · GenLayer Stable Studionet (Chain ID 61999) · Intelligent Contract · linguacourt-1</p>
          <p className="mono">Contract: {dep ? dep.contract_address : 'awaiting deployment.json — UNCONFIRMED'}{dep && <> · <a href={explorerAddress(dep.contract_address)} target="_blank" rel="noreferrer">explorer-studio.genlayer.com</a></>}</p>
          <p className="mono small">Source SHA-256: {dep ? dep.source_sha256 : '—'} · Fee: 10 GEN fixed · {t('verdictExpl', lang)}</p>
        </div>
      </footer>
    </div>
  );
}
