# LinguaCourt v3 — Local validation

Source protocol: `linguacourt-3`. Network target: Stable Studionet 61999.
Source SHA-256: `0a201dd7ab87b1fc5bf342083d3255873b1acb8a0b8f5d8578a8bf537a197feb`.
This file records the initial pre-deployment local run. It does not establish wallet signatures, consensus receipts or live settlement. Subsequent chain results are recorded separately in [LIVE_VALIDATION.md](LIVE_VALIDATION.md).

| Requirement | Implementation | Automated local coverage |
| --- | --- | --- |
| Stored client brief participates in judgment | `_judge_prompt` serializes `client_brief`; leader and validator independently execute the same rubric | Identical source/translation produces ACCEPT vs PARTIAL when fixture brief changes; both prompts captured |
| Defined client review before translator escalation | Immutable 86400-second deadline stored on submission from deterministic GenVM transaction datetime | Immediate, deadline minus one, exact deadline, after deadline, repeated early call, role attacks and forged extra timestamp argument |
| Meaningful contract tests | Real contract imported with GenVM/LLM stubs; validator callback now actually runs | Independent verdict disagreement leaves full case unchanged; brief injection fixture, invalid clock, timezone equivalence, client actions, existing escrow/withdrawal regressions |

## Reproduce

```
npm ci
python3 -m pip install -r requirements-dev.txt
npm test
npm run typecheck
npm run preflight
npm run build
```

Observed results:

- `npm test`: **29 passed**, 0 failed (20 existing cases, 9 added tests with boundary subcases). An environment-provided anyio pytest plugin emitted a deprecation warning.
- `npm run typecheck`: exit 0 after adding missing React/DOM/Node declarations and correcting SDK enum/address/hash types. SDK 1.1.8 implements `fullTransaction` at runtime although its type declaration omits it; the request retains that flag.
- `npm run preflight`: **9 checks passed**, including source hash/bytes, chain configuration, fixed period, matching frontend descriptor, no reused address, preserved v2 source bytes and three script syntax checks. This is offline, not a GenVM execution test.
- `npm run build`: exit 0, Vite production build and version stamping succeeded. Main JS is approximately 738 kB; Vite emitted the existing >500 kB chunk advisory.
- Read-only RPC `eth_chainId`: response `0xf22f` (=61999). This verifies network identity only, not v3 runtime compatibility.
- Browser smoke test: **not completed**. Vite preview initially failed with `uv_interface_addresses`; binding 127.0.0.1 succeeded. The runtime Playwright browser binary was absent. System Chromium launch then failed with `socket() failed: Operation not permitted`; no UI pass is claimed.

Initial test setup lacked pytest; installing the pinned test dependency resolved it.
The first optional TypeScript check exposed missing original type declarations and
SDK type mismatches; these were fixed and the final check passed. No failed chain
records were deleted or reclassified. The initial offline preflight and direct read-only chain-ID request completed; subsequent deployments and live attempts are recorded separately.

## Chain validation still required

The pinned runtime must execute the new datetime access successfully. Deploy a new
address, require FINALIZED + MAJORITY_AGREE + leader SUCCESS and exact source-byte
parity. Then execute the expectations in `EXPECTED.md`: real brief-only verdict
pair, early escalation error with unchanged state, post-deadline escalation and
complete withdrawal accounting. The 24 hours is measured from submission transaction
time, not from finalization or the browser clock. Validator model quality and prompt
injection resistance remain empirical, not established by canned unit fixtures.

The root v2 deployment/transactions and historical Pages build remain historical. The initial v3 build used a pending descriptor; after the fresh deployment, `public/deployment.json` was updated to the actual v3 descriptor.
