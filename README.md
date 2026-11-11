# LinguaCourt 译审庭 — Translation-Quality Escrow Court

**Live site: https://zuotu295.github.io/linguacourt-genlayer/**

A translation-quality escrow court on GenLayer Stable Studionet (Chain ID 61999). A client posts a source text + target language, names a **designated translator**, and escrows a fixed **10 GEN** fee. Only the designated translator may submit a translation. The client accepts (fee released in full) or disputes. On dispute — or when the designated translator escalates a silent client's case — GenLayer validators judge the translation against the source text itself and return one fixed verdict — **ACCEPT / PARTIAL / REJECT** — and deterministic contract code settles the fee:

| Verdict | Translator | Client |
| --- | --- | --- |
| ACCEPT | 100% (10 GEN) | 0 |
| PARTIAL | 50% (5 GEN) | 50% (5 GEN) |
| REJECT | 0 | 100% refund (10 GEN) |

Withdraw is pull-payment, once per entitled party per case. Sender-bound roles: only the case client can accept, dispute or cancel; only the designated translator can submit or escalate; one translation per case; dispute/escalation only after submission; accept only before dispute. A verbatim copy of the source is rejected deterministically, without any LLM call.

## Escrow exits (explicit actions only — Studionet has no clock)

- **Cancel while OPEN:** the client cancels and the full 10 GEN is credited back to the client for withdraw. Cancel while SUBMITTED is forbidden (the client has already seen the translation; cancel-after-submit would let them take the work and the refund).
- **Escalate while SUBMITTED:** if the client stays silent, the designated translator escalates to dispute; validators run the *same* judgment as a client dispute, and the triggering translator cannot influence the verdict. The client keeps accept/dispute rights until the case settles.
- There are no time gates, block-time checks, or timestamps anywhere in the contract: every transition is an explicit action.

## Why GenLayer is indispensable here

Translation quality is an ambiguous semantic judgment: no single honest server can settle whether a translation is faithful, partially wrong, or in the wrong language. LinguaCourt needs several independent validators to read the source and the translation and agree on one verdict. Deterministic code — not any single LLM output — decides money and state.

## Contract

- `contracts/linguacourt.py` — `LinguaCourt`, protocol `linguacourt-2` (v1, `linguacourt-1`, is archived under `evidence/v1/`)
- Fixed escrow: 10 GEN (`10000000000000000000` wei), `create_case` is `@gl.public.write.payable` and takes the designated translator address (validated `0x` 42-char hex, must differ from the client)
- `submit_translation` (designated translator only), `cancel_case` (client, OPEN only), `accept_case` (deterministic), `dispute_case` (consensus), `escalate_to_dispute` (designated translator, consensus), `withdraw` (pull-payment)
- Narrow LLM: validators answer exactly one fixed-enumeration question (`verdict` + one short `reason`); equivalence is exact agreement on the verdict; the reason must pass a deterministic, negation-aware direction check. The judgment prompt marks all INPUT as untrusted data and instructs validators to ignore any instruction embedded in it (see the injection evidence case). The evidence is the on-chain text itself — no external URL fetch, no dead-link failure mode.
- Views: `get_case`, `get_all_cases`, `get_totals`, `get_protocol`
- Deployment facts: `evidence/deployment.json` (address, deploy tx, source SHA-256, byte parity). Pre-registered expectations: `EXPECTED.md`.

## Frontend

Vite + React + TypeScript (`src/`), styled as an editorial proofreader's desk — paper, serif headlines, proofreader-red and annotation-blue marks. Bilingual CN/EN throughout; on-chain values (statuses, verdicts) in English.

- All reads pinned to `latest-final` with a visible FINALIZED marker + the time the latest-final readback completed (labelled as a readback time, with timezone — never presented as an on-chain finalization timestamp); cold start shows only unconfirmed/neutral state; no success is shown before FINALIZED + SUCCESS; export is gated until a FINALIZED readback.
- Wallet: OKX Wallet and MetaMask via injected provider (Studionet 61999 auto-add, wrong-chain detection with switch prompt and verification, writes blocked until the chain is correct). Writes also offer a clearly labelled in-browser temporary test account (key in sessionStorage only, free testnet GEN funding), never packaged as a user-wallet signature.
- Temporary-account safety: escrow funding (`create_case`) requires a persistent wallet — a temp account is blocked from creating cases. The temp private key is shown once with copy/export and an "I saved my key" acknowledgement before its first write; a persistent risk banner is shown while a temp account is active; disconnect/rotate/close warns with a blocking confirm listing the cases and funds tied to that temp address; the key can be exported at any time.
- Tx lifecycle: the tx hash is saved to localStorage immediately after send; a timeout is shown as "unknown — check chain", never as a final failure; polling continues and resumes after refresh from the stored hash; success is shown only on FINALIZED + SUCCESS. Every write asks for a double confirmation (action + amount + case) before sending.
- Every main button works against the real deployed contract. Bundle is version-stamped (`?v=<sha>`) after build so GitHub Pages never serves a stale build.

## Run locally

```bash
npm install
npm run build
npm run preview
```

## Deploy & verify (Stable Studionet only)

```bash
npm test            # contract mock tests (20 cases)
node scripts/deploy_studionet.mjs    # deploy + byte-parity check
node scripts/run_evidence.mjs        # full evidence run (6 cases + 11 negatives; resumable)
node scripts/verify_evidence.mjs     # independent re-verification, read-only
```

Evidence transactions: `evidence/transactions.json` (see `EVIDENCE.md`).

## What this project does not prove

- **No independent anchor by design.** The evidence is the on-chain source text and translation themselves — both are party-supplied. There is no external, independently verifiable source (no URL fetch, no third-party record) that the verdict is checked against; validators judge the text in front of them. A client and translator who collude on the text can produce any verdict the text supports.
- **The accept path pays without consensus, by the buyer's own choice.** When the client accepts, the full fee is released with no validator judgment at all. That is the intended UX (a happy client should not wait for a court), not a verification of quality.
- **No clock-based timeout.** Studionet has no clock, so a silent client cannot be timed out; the only recovery is the translator's explicit escalation, and a case with no translator action stays SUBMITTED indefinitely.
- **Validator judgment is LLM agreement, not proof.** Validators are independent LLM calls agreeing on one fixed verdict; agreement is not a mathematical proof that the translation is good, and a consensus disagreement leaves the case unsettled (retryable).
- **Fixed 10 GEN fee; no variable pricing, no revision rounds.** One translation per case; the client cannot request revisions — a new case is needed for a revised translation.

## Known limitations

- Fixed fee of 10 GEN per case; no variable pricing.
- Dispute verdicts depend on validator LLM agreement; a consensus disagreement leaves the case SUBMITTED and the dispute can be retried (recorded as an attempt in evidence).
- No time gates: every transition is an explicit action; a case stays OPEN until its designated translator submits, and stays SUBMITTED until the client acts or the translator escalates.
- One translation per case; the client cannot request revisions — a new case is needed for a revised translation.
- v1 (`linguacourt-1`, contract `0xE3F85C032a4B9eEc2978aEf39885Bf5374291C5D`) is superseded; its evidence is archived under `evidence/v1/` and must not be presented as v2 evidence.
- Platform behavior (verified live 2026-11-11): on Studionet a FAILED payable call does not refund the sent value — it stays in the contract with no entitlement. The first v2 deployment (`0x634667fEB842d7AA61c6c8cE3cC37b41D6432EBF`) was abandoned after two failed `create_case` calls stranded 11 GEN there; evidence never sends value on an expected-failure payable call.
