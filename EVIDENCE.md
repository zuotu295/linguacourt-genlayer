# LinguaCourt — Evidence

Network: Stable Studionet (Chain ID 61999). All transactions below are FINALIZED on Studionet.

## Deployment

- Contract: `0xE3F85C032a4B9eEc2978aEf39885Bf5374291C5D` — [https://explorer-studio.genlayer.com/address/0xE3F85C032a4B9eEc2978aEf39885Bf5374291C5D](https://explorer-studio.genlayer.com/address/0xE3F85C032a4B9eEc2978aEf39885Bf5374291C5D)
- Deploy tx: `0x5b6267351029e4fc611224da9083b647e709091ba16b811f7ad02417974519a2` — [https://explorer-studio.genlayer.com/tx/0x5b6267351029e4fc611224da9083b647e709091ba16b811f7ad02417974519a2](https://explorer-studio.genlayer.com/tx/0x5b6267351029e4fc611224da9083b647e709091ba16b811f7ad02417974519a2) (FINALIZED + MAJORITY_AGREE + leader SUCCESS)
- Source SHA-256: `798b117d6d133b66f82c077e55276de25f79ec44abda1fe2ec574f3c4824ea67` (11708 bytes), byte parity vs deployed code: TRUE
- Fixed escrow: 10 GEN per case

## Cases

### Case 1 — SETTLED_ACCEPT / verdict ACCEPT

- Client: `0x4e05d88b319437ae9a5bef07875ca042442f956c` · Translator: `0x95767cc5e54ef352c751a11d30a41987c7811a4c`
- Source (Spanish): The museum opens at nine in the morning and closes at six in the evening. Admission is free on Sundays.
- Translation: El museo abre a las nueve de la mañana y cierra a las seis de la tarde. La entrada es gratuita los domingos.
- Verdict reason: Client accepted the translation.
- Credits: translator 10 GEN, client 0 GEN

### Case 2 — SETTLED_PARTIAL / verdict PARTIAL

- Client: `0xfb45789ecea9c168943a3ae94457c104110ef595` · Translator: `0xb6110db2318fd40038c7809f617477a843d680b6`
- Source (French): The train leaves Paris at 8:15 and arrives in Lyon at 10:30. A standard ticket costs 25 euros.
- Translation: Le train part de Paris à 8h15 et arrive à Lyon à 10h30. Un billet standard coûte 52 euros.
- Verdict reason: The translation is in correct French and mostly faithful, but it materially errs by rendering "25 euros" as "52 euros".
- Credits: translator 5 GEN, client 5 GEN

### Case 3 — SETTLED_REJECT / verdict REJECT

- Client: `0xa688d4686e47eb69af5ef61b6f39a94ee16c6c57` · Translator: `0xa44fd353516765323d081c22c679015222a3f5c2`
- Source (German): Please water the plants twice a week and keep the cat indoors at night.
- Translation: Veuillez arroser les plantes deux fois par semaine et garder le chat à l'intérieur la nuit.
- Verdict reason: The translation is in French instead of the requested target language, German.
- Credits: translator 0 GEN, client 10 GEN

## Transactions (19 evidence txs + 1 deploy = 20 total)

- case1 create: `0x59b5019ebd17d1c57fe974f23f9834ed279d8996ebef518d7907d10ebce2d75f` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x59b5019ebd17d1c57fe974f23f9834ed279d8996ebef518d7907d10ebce2d75f))
- neg1 client-submits-own: `0x55eeb9bbfc450be747e26f2d333e6b6e0a0dc65e89ca794c43bd63a78750ba84` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0x55eeb9bbfc450be747e26f2d333e6b6e0a0dc65e89ca794c43bd63a78750ba84))
- case1 submit good Spanish: `0x2d2d149ee021bffb2a13857cba7d30c96df151d139c5f025c8ff3ab918782dcf` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x2d2d149ee021bffb2a13857cba7d30c96df151d139c5f025c8ff3ab918782dcf))
- neg2 duplicate-submit: `0x241ef6127940b60426a29593a653d457d44604b926a544a22b7aee9a2c7437c9` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0x241ef6127940b60426a29593a653d457d44604b926a544a22b7aee9a2c7437c9))
- neg3 outsider-accept: `0x18745c11b6498dd456110abc5eac0e52781c1fe524cc64d3604cf5bb66b63c15` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0x18745c11b6498dd456110abc5eac0e52781c1fe524cc64d3604cf5bb66b63c15))
- case1 accept: `0x6d39186bda629ed90d9d5ba20be2f8b73b944cb6bf64f6a10496e88dbfffe7f8` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x6d39186bda629ed90d9d5ba20be2f8b73b944cb6bf64f6a10496e88dbfffe7f8))
- case1 translator withdraw 10 GEN: `0xdb018cb5cb298173643c47a8020e4f3b708f2e2809e60c6078b2f8f20488dece` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xdb018cb5cb298173643c47a8020e4f3b708f2e2809e60c6078b2f8f20488dece))
- neg5 double-withdraw: `0xd12178fc7e26db492c5f49fe404275df8dd569466ada8c0aec4d985b237032fb` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0xd12178fc7e26db492c5f49fe404275df8dd569466ada8c0aec4d985b237032fb))
- case2 create: `0xd8b6e8b0b509754049d9bf86932901f055af486bb150234dda729d60672b8f9b` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xd8b6e8b0b509754049d9bf86932901f055af486bb150234dda729d60672b8f9b))
- case2 submit partial French: `0xa943b02a63ead81339353650150b6d20b06b13c89b1ca8b51f459f4ca230545b` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xa943b02a63ead81339353650150b6d20b06b13c89b1ca8b51f459f4ca230545b))
- neg4 outsider-dispute: `0x2dd7edb0880457c26b91a466d27c4b27f21ef132cf4f1f4eef3a21143978dfe7` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0x2dd7edb0880457c26b91a466d27c4b27f21ef132cf4f1f4eef3a21143978dfe7))
- case2 dispute: `0x47ef348d3e6be1c4e4bad87e4e13f9f4a3780362d01469207126050d2857920e` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x47ef348d3e6be1c4e4bad87e4e13f9f4a3780362d01469207126050d2857920e))
- case2 translator withdraw 5 GEN: `0xb527f4bd7c4ec0882692b4e8d0abfd79726be863a73767f774ae031ac5085e12` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xb527f4bd7c4ec0882692b4e8d0abfd79726be863a73767f774ae031ac5085e12))
- case2 client withdraw 5 GEN: `0x717586e8510f94219d1b4046a9112563878ce0868af0ec9783906ab272e57ac6` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x717586e8510f94219d1b4046a9112563878ce0868af0ec9783906ab272e57ac6))
- case3 create: `0x4eda814fc6b0afcd4f134cf6ac1c5ce3a7455c2945643b72d7fe1865f67e4a98` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x4eda814fc6b0afcd4f134cf6ac1c5ce3a7455c2945643b72d7fe1865f67e4a98))
- case3 submit wrong-language French: `0xf812c6a31164fd3a765e1b4b16c7bc73fb4894add527e2a513e0b4be279c77bc` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xf812c6a31164fd3a765e1b4b16c7bc73fb4894add527e2a513e0b4be279c77bc))
- case3 dispute: `0x3544a33942d00c2634495fe42d8767439a5ec2a267ad23a7ddcb1887383fa237` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0x3544a33942d00c2634495fe42d8767439a5ec2a267ad23a7ddcb1887383fa237))
- case3 client withdraw 10 GEN: `0xf5c55b3bf9583a9f752ee2af8cee662c427dd992f401ef3ae74d9e02418ba2d5` — ok ([explorer](https://explorer-studio.genlayer.com/tx/0xf5c55b3bf9583a9f752ee2af8cee662c427dd992f401ef3ae74d9e02418ba2d5))
- neg6 translator-no-credit-withdraw: `0x7ef8c4f67d3f82a3ab462f284872b9704011ed99da2b3a35bfb4fa34b39d0a80` — error-observed ([explorer](https://explorer-studio.genlayer.com/tx/0x7ef8c4f67d3f82a3ab462f284872b9704011ed99da2b3a35bfb4fa34b39d0a80))

## GEN accounting (read back latest-final)

- Total received: 30 GEN
- Total withdrawn: 30 GEN
- Contract balance: 0 GEN
- Escrowed: 0 GEN
- Accounting: 30 GEN in = 30 GEN out, no unexplained gap.

## Negative calls (all FINALIZED + leader ERROR, no state change)

- neg1 client-submits-own: CLIENT_CANNOT_TRANSLATE_OWN_CASE
- neg2 duplicate-submit: CASE_NOT_OPEN
- neg3 outsider-accept: ONLY_CLIENT_CAN_ACCEPT
- neg4 outsider-dispute: ONLY_CLIENT_CAN_DISPUTE
- neg5 double-withdraw: NO_CREDIT
- neg6 translator-no-credit-withdraw: NO_CREDIT

## Re-verify

```bash
node scripts/verify_evidence.mjs
```
