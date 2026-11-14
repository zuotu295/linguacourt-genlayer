# LinguaCourt v3 — Stable Studionet validation

## Deployment

- Network: Stable Studionet, chain 61999, RPC `https://studio.genlayer.com/api`.
- Contract: `0xD72656e8DC07fC2Be3849e64568bE5dB4AD2BdF2`.
- Deploy transaction: `0x26138a1ec3f371ab4d70014707c3000c0118b0dcd284c5e0fc32089dde05ff86`.
- Observed deployment: FINALIZED (7), MAJORITY_AGREE (6), leader SUCCESS.
- Deployed source is exactly equal to `contracts/linguacourt.py` (16007 bytes).
- Source SHA-256: `0a201dd7ab87b1fc5bf342083d3255873b1acb8a0b8f5d8578a8bf537a197feb`.
- Runtime datetime access succeeded on a real `submit_translation` transaction;
  case 1 stored `submitted_at=1794536313`, `review_deadline=1794622713`, delta 86400 seconds.

## Review checkpoint

The independent read-only review checkpoint completed with **68 PASS, 0 FAIL**.
This historical checkpoint precedes the final settlement. Full verification now uses `node scripts/verify_evidence.mjs` without the checkpoint flag.
See [verification output](review-checkpoint-verification.txt).

44 calls have been observed FINALIZED: 33 successful executions and 11 expected
contract errors, each with MAJORITY_AGREE. Deployment is recorded separately.

| Case | Observed result | Withdrawals |
| --- | --- | --- |
| 1 | Client ACCEPT | Translator 10 GEN |
| 2 | Validator PARTIAL for wrong ticket price | 5 GEN each |
| 3 | Validator REJECT for wrong language | Client 10 GEN |
| 4 | Client cancellation while OPEN | Client 10 GEN |
| 5 | Post-deadline escalation ACCEPT; early escalation rejected | Translator 10 GEN |
| 6 | Injected verdict instruction rejected; REJECT | Client 10 GEN |
| 7 | General brief satisfied; ACCEPT | Translator 10 GEN |
| 8 | Same source and translation; required term missing; PARTIAL | 5 GEN each |

Cases 7 and 8 retain identical source, target language and translation. Case 8's
stored brief requires the exact term "boleto"; the actual validator reason states
that the translation instead uses "entrada". This is real remote consensus,
separate from the local model fixtures.

The early escalation receipt is FINALIZED + MAJORITY_AGREE + leader ERROR with
`CLIENT_REVIEW_PERIOD_ACTIVE`. The before/after case snapshots match exactly
([early-escalation.json](early-escalation.json)). The submission receipt's
`created_at` matches stored `submitted_at` at Unix-second precision.

Latest-final accounting: 80 GEN received, 80 GEN withdrawn, zero balance and
zero escrow. There is no unexplained accounting gap.
The independent snapshot is [latest-readback.json](latest-readback.json).

## Completed review-window proof

Case 5's immutable deadline was Unix 1794623988 (2026-11-14 02:39:48 UTC).
After the real deadline, escalation returned ACCEPT and withdrawal completed.
Both receipts are FINALIZED + MAJORITY_AGREE + leader SUCCESS:
- Escalation: `0xa2791cc2483b7eb3f8c3569078570e779b1744e42d0e874dca57f3cb9d3558f5`.
- Withdrawal: `0xf0e46ce658934818c3ff2e1889a019b51d7f7b8f5000ac11a701df00ab555288`.

See [full verification](final-verification.txt), [review window](review-window.json)
and [transactions](transactions.json). No time override or shortened period was used.

## Tooling and transport observations

- Contract local tests: 29 passed; broadcast journal tests: 4 passed.
- TypeScript check and Vite production build passed; Vite retained its >500 kB
  bundle advisory. Offline preflight passed 11 checks.
- RPC transport failures and their reconciliation are retained in
  [attempts.json](attempts.json). No lost response was treated as a failed chain
  transaction or blindly resent. Signed submission journals remain private.
- Browser smoke verification remains incomplete because the environment blocked
  Chromium socket creation; no browser pass is claimed.
- The prepared frontend uses the new deployment descriptor and explains the
  24-hour period before funding. The Pages build is synchronized with this v3 descriptor.
