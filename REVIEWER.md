# LinguaCourt v3 — Contract verification

The stored brief is included in `_judge_prompt`, called independently by leader
and validator. Feasible translation requirements affect ACCEPT/PARTIAL/REJECT;
verdict and payment instructions embedded in fields remain untrusted input.
`submit_translation` stores a fixed 86400-second review deadline using deterministic
transaction datetime. `escalate_to_dispute` rejects early calls before any LLM call;
clients retain immediate accept/dispute rights. Existing settlement math is unchanged.

Run `npm test`, `npm run typecheck`, `npm run preflight`, and `npm run build`.
29 local tests exercise the actual contract with a mocked GenVM and LLM callbacks.
The brief-only fixture pair yields ACCEPT vs PARTIAL for identical text. Deadline
checks cover submission time, deadline minus one second, exact deadline and after;
role violations, repeated submissions/escalations, invalid clock context, independent
validator disagreement and injected brief instructions are included. These are not
live consensus or claims of prompt-injection immunity.

v3 has a fresh deployment recorded in `evidence/v3/deployment.json`. Deployment and source parity are verified. Independent review-stage verification produced 68 PASS, 0 FAIL; post-deadline escalation and final withdrawal remain pending. See [chain verification](evidence/v3/LIVE_VALIDATION.md).
[Expected live cases](EXPECTED.md) include brief-only verdict differences, an early
escalation failure with unchanged state, and successful escalation after 24 hours.
Real transactions must be FINALIZED with agreed consensus and expected execution;
new source bytes and protocol must match. No Developer Portal submission is automated.

[Historical v2 notes](evidence/v2/REVIEWER.md), [v2 transactions](evidence/v2/transactions.json),
and [failure/platform records](EVIDENCE.md) are retained. Use
`node scripts/verify_evidence.mjs --historical-v2` to verify archived v2 source and
receipts; that command never validates v3.

Time API: https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context
The runtime exposes transaction time, not a wall-clock or finalization guarantee.
The pinned runtime's actual datetime support must still be checked during v3 deployment.
