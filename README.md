# LinguaCourt 译审庭 — Translation-Quality Escrow Court

**Live site: https://zuotu295.github.io/linguacourt-genlayer/**

A translation-quality escrow court on GenLayer Stable Studionet (Chain ID 61999). A client posts a source text + target language and escrows a fixed **10 GEN** fee. A translator submits a translation. The client accepts (fee released in full) or disputes. On dispute, GenLayer validators judge the translation against the source text itself and return one fixed verdict — **ACCEPT / PARTIAL / REJECT** — and deterministic contract code settles the fee:

| Verdict | Translator | Client |
| --- | --- | --- |
| ACCEPT | 100% (10 GEN) | 0 |
| PARTIAL | 50% (5 GEN) | 50% (5 GEN) |
| REJECT | 0 | 100% refund (10 GEN) |

Withdraw is pull-payment, once per entitled party per case. Sender-bound roles: only the case client can accept or dispute; the translator is the first submitter and cannot be the client; one translation per case; dispute only after submission; accept only before dispute. A verbatim copy of the source is rejected deterministically, without any LLM call.

## Why GenLayer is indispensable here

Translation quality is an ambiguous semantic judgment: no single honest server can settle whether a translation is faithful, partially wrong, or in the wrong language. LinguaCourt needs several independent validators to read the source and the translation and agree on one verdict. Deterministic code — not any single LLM output — decides money and state.

## Contract

- `contracts/linguacourt.py` — `LinguaCourt`, protocol `linguacourt-1`
- Fixed escrow: 10 GEN (`10000000000000000000` wei), `create_case` is `@gl.public.write.payable`
- `submit_translation`, `accept_case` (deterministic), `dispute_case` (consensus), `withdraw` (pull-payment)
- Narrow LLM: validators answer exactly one fixed-enumeration question (`verdict` + one short `reason`); equivalence is exact agreement on the verdict; the reason must pass a deterministic direction check. The evidence is the on-chain text itself — no external URL fetch, no dead-link failure mode.
- Views: `get_case`, `get_all_cases`, `get_totals`, `get_protocol`
- Deployment facts: `evidence/deployment.json` (address, deploy tx, source SHA-256, byte parity)

## Frontend

Vite + React + TypeScript (`src/`), styled as an editorial proofreader's desk — paper, serif headlines, proofreader-red and annotation-blue marks. Bilingual CN/EN throughout; on-chain values (statuses, verdicts) in English.

- All reads pinned to `latest-final` with a visible FINALIZED marker + timestamp; cold start shows only unconfirmed/neutral state; no success is shown before FINALIZED + SUCCESS; export is gated until a FINALIZED readback.
- Wallet: OKX Wallet and MetaMask via injected provider (Studionet 61999 auto-add); writes also offer a clearly labelled in-browser temporary test account (key in sessionStorage only, free testnet GEN funding), never packaged as a user-wallet signature.
- Every main button works against the real deployed contract. Bundle is version-stamped (`?v=<sha>`) after build so GitHub Pages never serves a stale build.

## Run locally

```bash
npm install
npm run build
npm run preview
```

## Deploy & verify (Stable Studionet only)

```bash
npm test            # contract mock tests (9 cases)
node scripts/deploy_studionet.mjs    # deploy + byte-parity check
node scripts/run_evidence.mjs        # full evidence run (3 cases + 6 negatives)
node scripts/verify_evidence.mjs     # independent re-verification, read-only
```

Evidence transactions: `evidence/transactions.json` (see `EVIDENCE.md`).

## Known limitations

- Fixed fee of 10 GEN per case; no variable pricing in v1.
- Dispute verdicts depend on validator LLM agreement; a consensus disagreement leaves the case SUBMITTED and the dispute can be retried (recorded as an attempt in evidence).
- No time gates: every transition is an explicit action; a case stays OPEN until a translator submits.
- One translation per case; the client cannot request revisions — a new case is needed for a revised translation.
