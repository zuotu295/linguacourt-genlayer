import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHAIN_ID, FEE_WEI, TARGET_LANGS, loadDeployment, DEPLOYMENT, contractAddress,
  explorerTx, explorerAddress, reader, readAllCases, readTotals, readCase,
  sendWriteOnly, waitFinalized, txGood, leaderExecution, leaderPayload,
  connectInjected, temporaryAccount, rotateTemporaryAccount, destroyTemporaryAccount,
  tempPrivateKey, isTempKeyAcked, ackTempKey,
  savePendingTx, loadPendingTxs, clearPendingTx, TxUnknownError,
  fmtReadbackTime, walletKind, shortAddr, gen, type CaseRec, type Totals, type Wallet,
} from './chain';
import { t, type Lang } from './i18n';
import { cpLen, validateCreate, validateTranslation, sourceError, briefError, translatorError, translationError } from './validate';

interface TxTrack { label: string; hash: string; stage: 'sent' | 'finalized-ok' | 'failed' | 'unknown'; receipt?: any; error?: string }

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
  const [keyModal, setKeyModal] = useState(false);
  const [keyAcked, setKeyAcked] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);

  const [src, setSrc] = useState('');
  const [target, setTarget] = useState('Spanish');
  const [brief, setBrief] = useState('');
  const [translatorAddr, setTranslatorAddr] = useState('');
  const [trText, setTrText] = useState('');

  const casesRef = useRef(cases);
  casesRef.current = cases;
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

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

  // Resume tracking of txs whose hash was saved before a refresh/timeout.
  // A resumed tx is never re-sent; it is only polled until FINALIZED.
  const resumePending = useCallback(async () => {
    const pending = loadPendingTxs();
    for (const p of pending) {
      setTx({ label: p.label, hash: p.hash, stage: 'sent' });
      try {
        const receipt = await waitFinalized(p.hash);
        const ok = txGood(receipt);
        setTx({ label: p.label, hash: p.hash, stage: ok ? 'finalized-ok' : 'failed', receipt, error: ok ? '' : leaderPayload(receipt) });
        clearPendingTx(p.hash);
        await refresh();
      } catch (e) {
        if (e instanceof TxUnknownError) {
          setTx({ label: p.label, hash: p.hash, stage: 'unknown', error: t('txUnknown', lang) });
        }
        // Still unknown: keep the hash stored; next refresh resumes again.
      }
    }
  }, [refresh, lang]);

  useEffect(() => {
    (async () => {
      try {
        setDep(await loadDeployment());
        await refresh();
        await resumePending();
      } catch (e: any) {
        setLoadError(e?.message || String(e));
      } finally { setLoading(false); }
    })();
  }, [refresh, resumePending]);

  // Warn before closing/navigating away while a temp account holds value.
  useEffect(() => {
    if (!wallet || wallet.mode !== 'temporary') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [wallet]);

  const sel = useMemo(() => cases.find((c) => c.case_id === selected) || null, [cases, selected]);

  // Live validation state for the create form and the translation form.
  // Counts are code points (matching the contract's Python len()).
  // Inline errors show only once a field has content, so a fresh empty
  // form is not noisy. Buttons stay disabled while invalid; the handler
  // checks in onCreate / onSubmitTr are the real gate, not the buttons.
  const createErr = validateCreate({ source: src, target, brief, translator: translatorAddr, client: wallet?.address || '' });
  const srcErr = src.length > 0 ? sourceError(src) : null;
  const briefErr = brief.length > 0 ? briefError(brief) : null;
  const translatorErr = translatorAddr.trim().length > 0 ? translatorError(translatorAddr, wallet?.address || '') : null;
  const trErr = validateTranslation(trText);
  const trFieldErr = trText.length > 0 ? translationError(trText) : null;

  function tempExposure(addr: string): string[] {
    const lines: string[] = [];
    for (const c of casesRef.current) {
      const asT = c.translator === addr;
      const asC = c.client === addr;
      if (!asT && !asC) continue;
      const parts: string[] = [`Case #${c.case_id} (${c.status})`];
      if (asT && c.translator_credit > 0 && !c.translator_withdrawn) parts.push(`translator credit ${gen(c.translator_credit)} GEN unwithdrawn`);
      if (asC && c.client_credit > 0 && !c.client_withdrawn) parts.push(`client credit ${gen(c.client_credit)} GEN unwithdrawn`);
      if (c.status === 'OPEN' && asC) parts.push('10 GEN escrowed, case still OPEN');
      if (c.status === 'SUBMITTED' && (asC || asT)) parts.push('10 GEN escrowed, case SUBMITTED');
      lines.push(parts.join(' — '));
    }
    return lines;
  }

  async function confirmTempLoss(action: string): Promise<boolean> {
    const w = walletRef.current;
    if (!w || w.mode !== 'temporary') return true;
    const lines = tempExposure(w.address);
    const msg = (lang === 'zh'
      ? `⚠ 你正在${action}临时测试账户 ${w.address}。\n没有私钥，这个地址将永远无法找回。\n`
      : `⚠ You are about to ${action} the temporary test account ${w.address}.\nWithout its private key, this address is unrecoverable.\n`)
      + (lines.length
        ? (lang === 'zh' ? '与该地址有关的案件/资金：\n' : 'Cases / funds tied to this address:\n') + lines.join('\n') + '\n'
        : (lang === 'zh' ? '该地址目前没有链上案件。\n' : 'This address currently has no on-chain cases.\n'))
      + (lang === 'zh' ? '确定继续吗？（先导出私钥可避免丢失。）' : 'Continue? (Export the private key first to avoid losing access.)');
    return window.confirm(msg);
  }

  async function doWrite(label: string, fn: string, args: any[], value = 0n, amountText = '') {
    const w = walletRef.current;
    if (!w) { setNotice(t('notConnected', lang)); return null; }
    if (fn === 'create_case' && w.mode === 'temporary') {
      setNotice(t('tempBlockedCreate', lang));
      return null;
    }
    if (w.mode === 'temporary' && !isTempKeyAcked()) {
      setKeyModal(true);
      setNotice(t('keyModalTitle', lang));
      return null;
    }
    const confirmText = `${t('confirmSend', lang)}\n— ${label}${amountText ? `\n— ${amountText}` : ''}\n— Contract: ${contractAddress()}\n— Network: Studionet 61999`;
    if (!window.confirm(confirmText)) return null;
    setBusy(label);
    setNotice('');
    setTx({ label, hash: '', stage: 'sent' });
    try {
      // Hash is saved to localStorage IMMEDIATELY after send, before any wait.
      const hash = await sendWriteOnly(w, fn, args, value);
      savePendingTx(hash, label);
      setTx({ label, hash, stage: 'sent' });
      let receipt: any;
      try {
        receipt = await waitFinalized(hash);
      } catch (e) {
        if (e instanceof TxUnknownError) {
          // Timeout is "unknown", never a final failure: keep polling in
          // the background and let a refresh resume from the saved hash.
          setTx({ label, hash, stage: 'unknown', error: t('txUnknown', lang) });
          (async () => {
            for (let i = 0; i < 10; i++) {
              try {
                const r2 = await waitFinalized(hash);
                const ok2 = txGood(r2);
                setTx({ label, hash, stage: ok2 ? 'finalized-ok' : 'failed', receipt: r2, error: ok2 ? '' : leaderPayload(r2) });
                clearPendingTx(hash);
                await refresh();
                return;
              } catch { /* still unknown; keep polling */ }
            }
          })();
          return null;
        }
        throw e;
      }
      clearPendingTx(hash);
      const ok = txGood(receipt);
      setTx({ label, hash, stage: ok ? 'finalized-ok' : 'failed', receipt, error: ok ? '' : leaderPayload(receipt) });
      await refresh();
      return ok ? receipt : null;
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || String(e);
      if (String(msg).includes('WRONG_CHAIN')) setNotice(t('wrongChain', lang));
      setTx({ label, hash: '', stage: 'failed', error: msg });
      return null;
    } finally { setBusy(''); }
  }

  async function onConnect() {
    setWalletBusy(true);
    try {
      const w = await connectInjected();
      setWallet(w);
    } catch (e: any) {
      setNotice('Wallet connect failed: ' + (e?.message || String(e)));
    } finally { setWalletBusy(false); }
  }
  async function onTemp() {
    setWalletBusy(true);
    try {
      const w = await temporaryAccount();
      setWallet(w);
      setKeyAcked(isTempKeyAcked());
      setKeyCopied(false);
      setKeyRevealed(false);
      if (!isTempKeyAcked()) setKeyModal(true);
    } catch (e: any) { setNotice('Temporary account failed: ' + (e?.message || String(e))); }
    finally { setWalletBusy(false); }
  }
  async function onRotate() {
    if (!(await confirmTempLoss(lang === 'zh' ? '更换' : 'rotate'))) return;
    setWalletBusy(true);
    try {
      const w = await rotateTemporaryAccount();
      setWallet(w);
      setKeyAcked(false);
      setKeyCopied(false);
      setKeyRevealed(false);
      setKeyModal(true);
    } catch (e: any) { setNotice(String(e?.message || e)); }
    finally { setWalletBusy(false); }
  }
  async function onDisconnect() {
    if (!(await confirmTempLoss(lang === 'zh' ? '断开' : 'disconnect'))) return;
    destroyTemporaryAccount();
    setWallet(null);
  }
  function copyTempKey() {
    const pk = tempPrivateKey();
    if (!pk) return;
    navigator.clipboard?.writeText(pk).then(() => setKeyCopied(true)).catch(() => setKeyCopied(false));
  }
  function exportTempKey() {
    const pk = tempPrivateKey();
    if (!pk) return;
    const blob = new Blob([pk + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linguacourt-temp-key-${wallet?.address || 'unknown'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function confirmKeySaved() {
    ackTempKey();
    setKeyAcked(true);
    setKeyModal(false);
    setNotice(t('keySaved', lang));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) { setNotice(t('notConnected', lang)); return; }
    if (wallet.mode === 'temporary') { setNotice(t('tempBlockedCreate', lang)); return; }
    // Full contract-bounds gate BEFORE the payable send: a failed payable
    // call strands its 10 GEN on Studionet (no refund). Never rely on
    // maxLength alone — it counts UTF-16 units, not code points.
    const err = validateCreate({ source: src, target, brief, translator: translatorAddr, client: wallet.address });
    if (err) { setNotice(err); return; }
    const r = await doWrite(t('createTitle', lang), 'create_case', [src.trim(), target, brief.trim(), translatorAddr.trim().toLowerCase()], FEE_WEI, '10 GEN escrow');
    if (r) { setSrc(''); setBrief(''); setTranslatorAddr(''); }
  }
  async function onSubmitTr(c: CaseRec) {
    const err = validateTranslation(trText);
    if (err) { setNotice(err); return; }
    const r = await doWrite(t('submitTr', lang), 'submit_translation', [c.case_id, trText.trim()], 0n, `Case #${c.case_id}`);
    if (r) setTrText('');
  }
  async function onWithdraw(c: CaseRec) {
    if (!wallet) return;
    const amt = wallet.address === c.translator ? gen(c.translator_credit) : gen(c.client_credit);
    await doWrite(t('withdraw', lang), 'withdraw', [c.case_id], 0n, `${amt} GEN · Case #${c.case_id}`);
  }
  function exportDossier(c: CaseRec) {
    if (!readback.done) return;
    const dossier = {
      product: 'LinguaCourt', protocol: 'linguacourt-2', network: 'Stable Studionet', chain_id: CHAIN_ID,
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
  const isTranslator = (c: CaseRec) => me && c.translator === me;

  // This temp address's actual exposure, computed from the on-chain docket:
  // unsettled cases it is a party to + withdrawable credits. A fresh temp
  // address has none (temp accounts cannot create cases / escrow funds).
  const myCases = wallet?.mode === 'temporary' ? cases.filter((c) => c.client === me || c.translator === me) : [];
  const unsettledCount = myCases.filter((c) => c.status === 'OPEN' || c.status === 'SUBMITTED').length;
  const withdrawableGen = myCases.reduce((s, c) => s
    + (c.translator === me && c.translator_credit > 0 && !c.translator_withdrawn ? Number(gen(c.translator_credit)) : 0)
    + (c.client === me && c.client_credit > 0 && !c.client_withdrawn ? Number(gen(c.client_credit)) : 0), 0);
  const tempKey = tempPrivateKey();
  const maskedKey = !tempKey ? '—' : keyRevealed ? tempKey : tempKey.slice(0, 6) + '…' + tempKey.slice(-4);

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
              {wallet.mode === 'temporary' && <><button className="mini" onClick={exportTempKey}>{t('exportKey', lang)}</button><button className="mini" onClick={onRotate}>{t('rotate', lang)}</button></>}
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

      {wallet?.mode === 'temporary' && <div className="temp-banner">🧪 {t('tempNote', lang)} — {wallet.address} <button className="mini" onClick={exportTempKey}>{t('exportKey', lang)}</button></div>}
      {!wallet && <div className="temp-banner neutral">{t('notConnected', lang)}</div>}
      {notice && <div className="notice">{notice}</div>}

      {keyModal && wallet?.mode === 'temporary' && (
        <div className="key-modal" role="dialog" aria-modal="true">
          <div className="key-modal-card paper">
            <h3>{t('keyModalTitle', lang)}</h3>
            <p>{t('keyModalBody', lang)}</p>
            <p className="mono small">Temp address: {wallet.address}</p>
            <p className="key-exposure">{unsettledCount === 0 && withdrawableGen === 0
              ? t('keyExposureNone', lang)
              : t('keyExposure', lang).replace('{n}', String(unsettledCount)).replace('{x}', String(withdrawableGen))}</p>
            <p className="mono key-line">{maskedKey}</p>
            <p className="key-mask-note">{t('keyMaskNote', lang)}</p>
            <div className="actions">
              <button className="btn" onClick={() => setKeyRevealed(!keyRevealed)}>{keyRevealed ? t('keyHideFull', lang) : t('keyShowFull', lang)}</button>
              <button className="btn" onClick={copyTempKey}>{t('keyCopy', lang)}{keyCopied ? ' ✓' : ''}</button>
              <button className="btn" onClick={exportTempKey}>{t('keyExport', lang)}</button>
            </div>
            <label className="ack-row">
              <input type="checkbox" checked={keyAcked} onChange={(e) => setKeyAcked(e.target.checked)} /> {t('keyAck', lang)}
            </label>
            <button className="btn primary" onClick={confirmKeySaved} disabled={!keyAcked}>{t('keySaved', lang)}</button>
            <button className="btn ghost" onClick={() => setKeyModal(false)}>{t('keyLater', lang)}</button>
          </div>
        </div>
      )}

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
            <b>{readback.done ? fmtReadbackTime(readback.at) : '—'}</b>
            {readback.done && <small title={t('readbackNote', lang)}>ⓘ {t('readbackNote', lang)}</small>}
          </div>
        </section>

        {tx && (
          <section className={`tx-track ${tx.stage}`}>
            <b>{t('txProgress', lang)} · {tx.label}</b>
            {tx.stage === 'sent' && <p>⏳ {t('sent', lang)}{tx.hash ? <> · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{tx.hash.slice(0, 18)}… {t('viewExplorer', lang)}</a></> : ''}</p>}
            {tx.stage === 'unknown' && <p>❓ {t('txUnknown', lang)}{tx.hash ? <> · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{tx.hash.slice(0, 18)}… {t('viewExplorer', lang)}</a></> : ''}</p>}
            {tx.stage === 'finalized-ok' && <p>✅ {t('finalizedOk', lang)} · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{tx.hash.slice(0, 18)}… {t('viewExplorer', lang)}</a></p>}
            {tx.stage === 'failed' && <p>❌ {t('txFailed', lang)}{tx.hash ? <> · <a href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">{t('viewExplorer', lang)}</a></> : ''}{tx.error ? <code> {tx.error.slice(0, 200)}</code> : ''}</p>}
          </section>
        )}

        <div className="cols">
          <section className="panel paper">
            <h2>{t('createTitle', lang)}</h2>
            <form onSubmit={onCreate}>
              <label>{t('sourceLabel', lang)}
                <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder={t('sourcePh', lang)} rows={4} maxLength={2000} required />
              </label>
              <p className="count">{cpLen(src.trim())} / 2000</p>
              {srcErr && <p className="field-error">{srcErr}</p>}
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
              <p className="count">{cpLen(brief)} / 500</p>
              {briefErr && <p className="field-error">{briefErr}</p>}
              <label>{t('translatorLabel', lang)}
                <input value={translatorAddr} onChange={(e) => setTranslatorAddr(e.target.value)} placeholder={t('translatorPh', lang)} maxLength={42} required />
              </label>
              {translatorErr && <p className="field-error">{translatorErr}</p>}
              <p className="fee-note">{t('feeNote', lang)}</p>
              {wallet?.mode === 'temporary' && <p className="notice">{t('tempBlockedCreate', lang)}</p>}
              <button className="btn primary" type="submit" disabled={!!busy || !wallet || createErr !== null}>{busy ? '⏳ …' : t('createBtn', lang)}</button>
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
                    <textarea value={trText} onChange={(e) => setTrText(e.target.value)} placeholder={t('translationPh', lang)} rows={3} maxLength={2000} />
                    <p className="count">{cpLen(trText.trim())} / 2000</p>
                    {trFieldErr && <p className="field-error">{trFieldErr}</p>}
                    <button className="btn primary" onClick={() => onSubmitTr(sel)} disabled={!!busy || !wallet || trErr !== null}>{t('submitTr', lang)}</button>
                    {me && me === sel.client && <p className="hint">The client cannot translate their own case. / 客户不能翻译自己的案件。</p>}
                    {me && me !== sel.translator && me !== sel.client && <p className="hint">Only the designated translator ({shortAddr(sel.translator)}) can submit. / 只有指定译者可以提交译文。</p>}
                    {me && me === sel.client && (
                      <button className="btn danger" onClick={() => doWrite(t('cancel', lang), 'cancel_case', [sel.case_id], 0n, `10 GEN refund · Case #${sel.case_id}`)} disabled={!!busy}>{t('cancel', lang)}</button>)}
                  </div>
                )}
                {sel.status === 'SUBMITTED' && canAct(sel) && (
                  <div className="actions">
                    <button className="btn primary" onClick={() => doWrite(t('accept', lang), 'accept_case', [sel.case_id], 0n, `10 GEN to translator · Case #${sel.case_id}`)} disabled={!!busy}>{t('accept', lang)}</button>
                    <button className="btn danger" onClick={() => doWrite(t('dispute', lang), 'dispute_case', [sel.case_id], 0n, `Case #${sel.case_id} · verdict by validators`)} disabled={!!busy}>{t('dispute', lang)}</button>
                  </div>
                )}
                {sel.status === 'SUBMITTED' && isTranslator(sel) && (
                  <div className="actions">
                    <button className="btn danger" onClick={() => doWrite(t('escalate', lang), 'escalate_to_dispute', [sel.case_id], 0n, `Case #${sel.case_id} · verdict by validators`)} disabled={!!busy}>{t('escalate', lang)}</button>
                  </div>
                )}
                {sel.status === 'SUBMITTED' && me && !canAct(sel) && !isTranslator(sel) && <p className="hint">Only the case client can accept or dispute. / 只有案件客户可以接受或提交争议。</p>}
                {(sel.status.startsWith('SETTLED') || sel.status === 'CANCELLED') && (
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
          <p><b>LinguaCourt 译审庭</b> · GenLayer Stable Studionet (Chain ID 61999) · Intelligent Contract · linguacourt-2</p>
          <p className="mono">Contract: {dep ? dep.contract_address : 'awaiting deployment.json — UNCONFIRMED'}{dep && <> · <a href={explorerAddress(dep.contract_address)} target="_blank" rel="noreferrer">explorer-studio.genlayer.com</a></>}</p>
          <p className="mono small">Source SHA-256: {dep ? dep.source_sha256 : '—'} · Fee: 10 GEN fixed · {t('verdictExpl', lang)}</p>
        </div>
      </footer>
    </div>
  );
}
