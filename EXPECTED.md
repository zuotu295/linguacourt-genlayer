# LinguaCourt v3 — live expectations (not executed)

Stable Studionet, chain 61999, protocol `linguacourt-3`, fixed 10 GEN fee.
The original six case paths and ten negative calls remain as documented in
[evidence/v2/EXPECTED.md](evidence/v2/EXPECTED.md), except case 5 must now wait
24 hours from its submission transaction before translator escalation.

Additional evidence:

| Case | Input/path | Expected |
| --- | --- | --- |
| neg10 | Designated translator escalates case 5 before stored review_deadline | FINALIZED + MAJORITY_AGREE + leader ERROR containing CLIENT_REVIEW_PERIOD_ACTIVE; full case snapshot unchanged |
| 5 after review | Translator escalates at or after review_deadline | ACCEPT, translator 10 GEN; deadline remains unchanged |
| 7 | Museum Spanish translation; brief: Use natural Spanish.; client disputes | ACCEPT, translator 10 GEN |
| 8 | Exactly same source and translation; brief: Use the exact term "boleto" for admission.; client disputes | PARTIAL for omitted required term, 5 GEN each |

All 8 cases escrow 80 GEN total; final withdrawals must total 80 GEN with zero
balance and escrow. Independently read all cases, protocol, source bytes and every
receipt using `latest-final`. A disagreement, unexpected error or wrong verdict
must remain recorded and must fail validation. No fixture output can replace it.

The runner persists hashes before waiting, resumes recorded successful steps and
stops before the review deadline without long polling. If the early-error window
was missed, stop for inspection; do not change the deadline or reinterpret a late
call as early evidence. Expected-failure payable calls send 0 value only, preserving
the documented Studionet failure behavior. Wallet keys stay outside this repository.
