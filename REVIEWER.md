# LinguaCourt — Reviewer notes

## How to verify (one command, read-only)

```bash
npm install
node scripts/verify_evidence.mjs
```

This re-reads everything live from Stable Studionet (Chain ID 61999) and
checks: deployed code equals `contracts/linguacourt.py` byte for byte;
the deploy tx and every evidence tx are FINALIZED with the expected
consensus/execution result; the three cases end ACCEPT / PARTIAL / REJECT
with the exact credits the settlement rules require; GEN accounting is
30 GEN in = 30 GEN out, contract balance 0, escrow 0.

## What to check by hand

- Explorer: contract address in `evidence/deployment.json`; every hash in
  `evidence/transactions.json` resolves on
  `https://explorer-studio.genlayer.com/`.
- Live site: https://zuotu295.github.io/linguacourt-genlayer/ — connect a
  wallet (OKX / MetaMask) or use the labelled in-browser temporary test
  account, post a case (10 GEN escrow), submit a translation, accept or
  dispute, watch the real transaction progress to FINALIZED, export the
  case dossier.

## Evidence map

- Case 1 (ACCEPT): good Spanish translation, client accepts — translator
  withdraws 10 GEN.
- Case 2 (PARTIAL): French translation with one material error (ticket
  price 25 → 52 euros) — validators judge PARTIAL, 5 GEN + 5 GEN withdrawn.
- Case 3 (REJECT): translation submitted in French while the target is
  German — validators judge REJECT, client withdraws the full 10 GEN.
- Negatives (all FINALIZED + leader ERROR, no state change): client
  submitting their own translation; duplicate submission; outsider
  accept; outsider dispute; double withdraw; translator withdrawing
  with no credit.

## Design decisions (what the contract does NOT do)

- No external URL fetch: the evidence is the on-chain source +
  translation text, so a dead link can never fail a case.
- No LLM free text decides money: validators answer one fixed question
  (verdict + one reason); exact agreement on the verdict is required;
  deterministic code settles the fee.
- No time gates: every transition is an explicit user action.
- Fixed 10 GEN fee in v1; no variable pricing.
