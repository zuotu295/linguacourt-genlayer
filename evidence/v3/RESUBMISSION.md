# LinguaCourt v3 — Review response

The client brief now participates in the independent leader and validator judgment through the shared `_judge_prompt`. Identical source and translation produce ACCEPT in case 7 and PARTIAL in case 8 when the brief requires the missing term “boleto”. These are live consensus results, separate from local fixtures.

The designated translator must wait 86400 seconds after submission before escalating. The contract stores immutable submission and deadline times using deterministic transaction datetime. Early escalation failed with CLIENT_REVIEW_PERIOD_ACTIVE without changing case state. After the actual deadline, case 5 escalation finalized with ACCEPT and its withdrawal succeeded.

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Brief affects judgment | Stored brief in both independent judgment prompts | Cases 7/8; transactions.json; 29 contract tests |
| Client review period | Immutable 24-hour deadline; deterministic transaction-time guard | early-escalation.json; review-window.json; case 5 receipts |
| Regression and adversarial checks | Role, repeat-call, deadline boundary, disagreement and injection coverage | LOCAL_VALIDATION.md; final-verification.txt |

Fresh deployment: `0xD72656e8DC07fC2Be3849e64568bE5dB4AD2BdF2`, Stable Studionet chain 61999, protocol `linguacourt-3`. Deployed source matches repository bytes, SHA-256 `0a201dd7ab87b1fc5bf342083d3255873b1acb8a0b8f5d8578a8bf537a197feb`.

44 finalized calls: 33 successful and 11 expected contract errors, each with majority agreement. Deployment is separate. Aggregate accounting: 80 GEN received, 80 GEN withdrawn, zero balance and escrow. Historical v2 evidence and RPC failures remain retained.

Local checks: 29 contract tests, 4 RPC journal tests, typecheck, 11 preflight checks and production build passed. Browser smoke validation remains incomplete due to the recorded Chromium environment restriction. LLM quality and injection resistance remain empirical rather than guaranteed.

Site: https://zuotu295.github.io/linguacourt-genlayer/

Reproduce live read-only verification: `node scripts/verify_evidence.mjs`.
