# Blocking-question research

Research refreshed **2026-07-26** using only official Stake Engine repositories,
the exact npm artifact, and the official RGS/approval documentation. This report
narrows the original questions; it does not substitute for a vendor statement
where the official sources remain silent.

## Resolution summary

| Question                    | Result                                                                                                                                                                                                                                                               | Milestone effect                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-package compatibility | **Resolved for architecture:** no official source says all three packages must be installed together. Web SDK is an optional reference frontend, math SDK produces RGS artifacts, and ts-client is an optional RGS client. No supported release matrix is published. | Use protocol/artifact boundaries; do not claim a tested three-package matrix.                                                                                   |
| Web SDK license             | **Partially resolved:** official commit history deliberately added SPDX `MIT` declarations to the root and workspaces, but no license text/copyright notice exists.                                                                                                  | Reference inspection is allowed by repository access; copying/distribution remains blocked pending canonical notice/text.                                       |
| TypeScript client license   | **Partially resolved:** GitHub and exact npm metadata both declare SPDX `ISC`; neither source nor tarball contains license text/copyright holder.                                                                                                                    | Do not add/distribute the package until the canonical notice/text is supplied or counsel accepts the metadata as sufficient.                                    |
| Retry/reconnect/idempotency | **Resolved operationally; protocol idempotency unverified:** official clients do not retry. The reference frontend stops on play failure and recovers committed rounds through Authenticate on reload. Event checkpoints are best-effort.                            | Do not blindly replay mutations. Re-authenticate and branch on authoritative round state. Test failure injection in staging before considering automatic retry. |
| Unfinished-round behavior   | **Substantially resolved:** Authenticate can return an active round; frontend should continue it. `round.event` records progress, `/bet/event` updates it, and `/wallet/end-round` completes/pays the round after presentation.                                      | ADR 0004 can define recovery around re-authenticate → restore `round.state`/`round.event` → continue → end-round; ambiguous request retry remains open.         |
| Runtime/toolchain           | **Partially resolved:** web SDK requires Node `>=22.16.0`/pnpm `10.5.0`; the RGS example uses Svelte 5/Vite and says “NPM v22.16.0” (apparently a documentation label error); ts-client publishes no `engines`/browser matrix and directly requires browser globals. | Pin build tooling locally when implementation is approved; supported consumer matrix still needs confirmation.                                                  |
| Versioned approval guidance | **Resolved for evidence, not vendor versioning:** the site has content-addressed JS assets and HTTP `Last-Modified`, but no public semantic revision/changelog or retention promise.                                                                                 | Record retrieval time, immutable-looking asset URL, response hash, and live recheck; request a vendor export for submission evidence.                           |

## 1. Package relationship and compatibility

### Verified facts

- The web SDK describes itself as an optional way to build and launch games and
  permits any framework that produces a static site
  ([README](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/README.md#L1-L7),
  [FAQ](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/README.md#L141-L153)).
- The inspected web SDK tree does **not** depend on the npm `stake-engine`
  package. It implements RGS communication through local workspace packages.
  This corrects the previous version-matrix claim that a web app declared
  `stake-engine@0.1.32`.
- The official RGS page calls the npm client a way to “simplify communication,”
  not a mandatory runtime
  ([RGS details](https://stake-engine.com/docs/rgs)).
- Math output books, lookup tables, and index files are publication inputs; RGS
  returns a selected book's events to the frontend
  ([math quick start](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/docs/math_docs/quickstart.md#L18-L40)).

### Conclusion

There is no evidence of a required three-package dependency graph and no official
tested-version matrix. Compatibility is therefore contractual:

1. math artifacts must satisfy the current publication file formats;
2. RGS requests/responses must satisfy the documented wallet/event protocol; and
3. game-owned book events must match the frontend's versioned event schema.

This removes “obtain a three-package matrix” as a dependency blocker, while
retaining exact pins and contract tests for every component actually adopted.

## 2. License evidence

### Web SDK

Official commit
[`cfa5529`](https://github.com/StakeEngine/web-sdk/commit/cfa5529b773b081070bb49ca9092e440a4dd3121)
is titled `add license` and adds `"license": "MIT"` to the root and 21
workspaces. No `LICENSE`, `COPYING`, or equivalent notice exists at inspected
commit `1843d60`. The intent to declare MIT is verified; the copyright holder and
canonical notice required for compliant redistribution are not.

### TypeScript client

The source manifest at `df9e126` and npm metadata for exact version `0.1.32`
both declare `ISC`
([manifest](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/package.json#L1-L36)).
The npm tarball contains 26 files but no license file. Its official registry
metadata records publication at `2025-10-26T01:24:36.174Z`, SHA-512 integrity
`sha512-gP2VvKNjurztJI41HsURhqlotDMzXJh2HrIpD5y7P3pBFn9zoJ6o4Po7dof9/1ZhGHv22lS0qgJwTaikp1QtyA==`,
and npm SHA-1 `b0c83d3e5e0e1fd31a849cd4294b26c44fab94c5`.

### Remaining vendor request

Ask Stake Engine to add canonical license files, including copyright holders, to
both repositories and future package archives. Until then, do not copy web SDK
code/assets or add/distribute the npm client.

## 3. Errors, retries, reconnects, and ambiguous responses

### Verified behavior

- Authenticate must precede other wallet calls; otherwise RGS returns HTTP 400
  `ERR_IS` ([RGS details](https://stake-engine.com/docs/rgs)).
- Published client errors are `ERR_VAL`, `ERR_IPB`, `ERR_IS`, `ERR_ATE`,
  `ERR_GLE`, and `ERR_LOC`; server errors are `ERR_GEN` and
  `ERR_MAINTENANCE` ([wallet docs](https://stake-engine.com/docs/rgs/wallet)).
- `stake-engine@0.1.32` throws for non-2xx results but has no timeout,
  `AbortSignal`, retry, backoff, reconnect, or idempotency API
  ([client source](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/src/client.ts#L82-L137)).
- Every published TypeScript-client implementation descends from the same initial
  request lifecycle. Its history adds currencies, exports, formatting, and an
  HTTP protocol option, but no retry/recovery layer.
- The official web SDK fetch wrapper performs exactly one `fetch` and has no
  timeout or retry
  ([fetcher](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-fetcher/src/fetcher.ts#L1-L16)).
- A play failure stops autoplay, displays an error modal, and rejects the bet
  state-machine operation; it is not resubmitted
  ([primary machine](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-xstate/src/createPrimaryMachines.ts#L9-L40),
  [bet machine](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-xstate/src/createIntermediateMachineBet.ts#L41-L63)).
- On reload, Authenticate stores any returned round state for resumption
  ([Authenticate](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/components-shared/src/components/Authenticate.svelte#L71-L102)).
- The generated web SDK schema identifies a unique RGS round ID, an active flag,
  saved event, and game state. An older status table also names “player already
  has an active bet,” but the generated union omits that symbol and current public
  RGS docs omit it. It is useful corroboration that concurrent plays are rejected,
  not a current public error contract
  ([schema](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/rgs-fetcher/src/schema.ts#L107-L190)).

### What an ambiguous response means

An ambiguous response is not an RGS error response. It is a client-side condition
where the browser cannot tell whether RGS committed a request—for example, the
connection drops after the server receives Play but before the response reaches
the browser. There are two possible authoritative states:

1. **Play did not commit:** Authenticate returns no active new round and the RGS
   balance remains authoritative.
2. **Play committed:** Authenticate returns the active round, including its unique
   ID, amount, mode, state, and saved event. The frontend continues it without
   placing another wager.

The same discriminator handles an uncertain EndRound: authenticate before taking
another monetary action; continue an active returned round, or accept the returned
completed/no-active state. This does not prove EndRound is idempotent and therefore
does not justify blindly repeating it.

### Evidence-based local policy

The official sources support a practical integration without prior vendor contact:

- send each monetary mutation once;
- treat an actual RGS error response according to its documented code;
- on a transport/parse interruption, freeze wagering and discard optimistic local
  balance;
- establish a fresh client page/session flow and Authenticate;
- hydrate balance exclusively from Authenticate;
- if an active round is returned, resume its recorded state/event; otherwise
  return to idle; and
- never use `/wallet/balance` alone to decide whether a round committed because it
  does not return round state.

This is recovery by authoritative observation, not retry. Formal endpoint
idempotency, server timeouts, and deduplication keys remain undocumented, but they
are no longer blockers while automatic retry is prohibited.

### Event checkpoint nuance

The web SDK records book progress by posting the event index. Its call is
fire-and-forget and is not awaited; therefore checkpoint loss does not stop the
animation, wager, or end-round flow
([book utility](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-book/src/utils.ts#L7-L26)).
On resume, examples split the immutable event list at the last recorded index and
rebuild the visual snapshot before playing the remainder
([lines resume conversion](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/apps/lines/src/game/utils.ts#L21-L49)).
Thus Event is a recoverability checkpoint, not monetary settlement. If its response
is lost, the safe consequence is potentially replaying already seen presentation,
not placing another wager. We should improve on the reference by awaiting and
observing checkpoints, but checkpoint failure must remain non-monetary.

## 4. Unfinished-round recovery

The official RGS documentation now supplies the missing lifecycle direction:

1. call `/wallet/authenticate` when the game loads;
2. if its `round.active` is true, continue that round rather than start another;
3. use `round.event` to identify saved presentation progress after disconnect;
4. post `/bet/event` during a long round to save progress; and
5. call `/wallet/end-round` after the round/animations complete, triggering payout
   and closing activity ([RGS details](https://stake-engine.com/docs/rgs),
   [wallet docs](https://stake-engine.com/docs/rgs/wallet)).

The docs say the returned round may be active or the last completed round. The
client exposes the returned `round` but provides no higher-level resume method,
so restoration of game-owned `round.state` and interpretation of `round.event`
remain frontend adapter responsibilities. Whether an interrupted event/end-round
request is idempotent remains undocumented; the adopted recovery flow does not
require a blind replay.

The web reference gives more detail about EndRound timing. A resumed active
single-round win is ended before its remaining animation, whereas an active bonus
win is ended after the resumed bonus presentation. EndRound failures are caught
without an automatic retry. A later reload authenticates again and either resumes
the still-active round or observes the completed state
([primary machine](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-xstate/src/createPrimaryMachines.ts#L42-L66),
[round-type lifecycle](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-xstate/src/createPrimaryMachines.ts#L93-L122),
[resume lifecycle](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/utils-xstate/src/createPrimaryMachines.ts#L160-L181)).

## 5. Money and language clarifications discovered

The official RGS page resolves two adjacent blockers:

- monetary values are integers with exactly six decimal places of precision;
  `1_000_000` represents one unit, and currency affects display only; and
- the RGS supported-language list uses ISO 639-1 `pl` for Polish, matching
  ts-client source. The approval page's `po` entry conflicts with both and is
  treated as an approval-document typo pending correction.

These facts support the integer-money ADR and remove the scale from the vendor
question list. Limits for JavaScript safe integers and future protocol-version
changes remain design checks.

## 6. Approval evidence snapshot

The approval page returned `Last-Modified: Sat, 25 Jul 2026 15:11:54 GMT` and
SHA-256
`1c664cd3480b22cc44f172a9113096244a7209ab0a8933d810aefc354dd7081b`
for its HTML shell. The relevant content-addressed page assets returned
`Last-Modified` values of 2026-07-22 and these SHA-256 hashes:

| Approval page asset             | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `68.qjpO1okb.js` — general      | `85e9d264552148517c3f90b26b78a2b6703b5fa553a2a4ba7bc3c78ad20b828f` |
| `69.CG261REI.js` — frontend     | `5a2c1f59ccb4ad9368301daea3ae940810f230fd0859811c849bd5c0de0f36df` |
| `70.Br5SMenY.js` — quality      | `b82f0c1b8e45e3756001278564baf59cb31347105b43f5642ff4f05ba44d4bdd` |
| `71.uuwURhL5.js` — replay       | `e550b7ee0d50efbfebb99ace4178f7b7f17c059457ae81787c5ea0c37fb257bd` |
| `72.k5Ppoz_g.js` — tile         | `ef3125e665ba0436f86e42d3cbf774f11340f2e2350d063912cf4c5e89778ec6` |
| `73.DDiJzLwl.js` — disclaimer   | `26c678603099282ddd4bcb555aeeb813bbf613a32ee0d149968f5f6ba5ce6cb4` |
| `74.DMn-Q6oM.js` — jurisdiction | `407d6af8c3fbaca553fff1e2a7696e97ac1ee788e75d48a99d0fdfd4704d136a` |
| `75.zMVn3Xzn.js` — math         | `cdb84231b6d8655ce33edb4131cc2ebf2399c4a3b5d9014877c22e0f6fd4816c` |
| `76.CMmPniII.js` — RGS          | `dd033490d13198f0a3b814e71ffc49a5855ed92e1c706232f146eee0fe110727` |

Content hashes make this capture reproducible while those assets remain hosted;
they do not prove a vendor release, promise retention, or replace a submission-day
live check.

## Vendor questions remaining after research

1. Provide canonical license text and copyright notices for web-sdk and
   `stake-engine@0.1.32`.
2. Confirm supported browsers and consumer toolchains for the TypeScript client.
3. Confirm whether the approval checklist can be exported/versioned for an exact
   submission and correct the RTP example and Polish `po` entry.

Endpoint idempotency is now a **nice-to-have clarification**, not a prerequisite:
ask only if staging failure injection contradicts the authenticate-based recovery
model or the project later proposes automatic mutation retry.
