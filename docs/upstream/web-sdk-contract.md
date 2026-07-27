# Web SDK contract

## Verified upstream facts

Inspected commit
[`1843d60`](https://github.com/StakeEngine/web-sdk/tree/1843d60cedb94b390e641b563f32ad64353bec5e)
has no tag or release. It is a pnpm/TurboRepo reference application requiring
Node `>=22.16.0` and pnpm `10.5.0`, powered by Svelte 5 and PixiJS 8. The root and
apps are private `0.0.0` workspaces, so there is no single public package/version
to install. The README explicitly permits another framework provided it builds a
static site ([FAQ](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/README.md#L141-L153)).

Relevant workspace surfaces include `rgs-requests`, `rgs-fetcher`,
`utils-fetcher`, `utils-book`, `utils-xstate`, `utils-shared`, shared state/UI
components, and the `pixi-svelte` export. These are source-level workspaces, not
a documented stable public API. We will not copy their internals or claim their
exports as supported SDK contracts.

The examples authenticate from launch URL parameters, call RGS play/end-round,
interpret math `bookEvent`s into frontend emitter events, display RGS balances,
and build/upload a static frontend. The README explains that end-round timing
determines resumability and varies for no-win, single-round-win, and bonus-win
flows ([FAQ](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/README.md#L163-L207)).

## Error, recovery, and lifecycle limits

- The sample dev screen expects authentication failure before an RGS launch URL
  is supplied; this is not a production error contract.
- The snapshot contains application-specific state machines and request helpers,
  but no release-level guarantee for retry, reconnect, or unfinished-round
  behavior.
- Approval guidance, not the sample, is authoritative: the frontend must use
  `rgs_url`, respect authenticated bet levels/jurisdiction, remain static and
  external-resource-free, and support mandatory replay.

## Local decision

Use this repository only as a pinned behavioral/reference source. Future code
will have locally owned rendering/state-machine boundaries and a narrow RGS
adapter. It will not fork sample applications, assets, or private workspace APIs.

## License and open questions

All relevant manifests declare MIT, and official commit
[`cfa5529`](https://github.com/StakeEngine/web-sdk/commit/cfa5529b773b081070bb49ca9092e440a4dd3121)
deliberately added those declarations. No MIT license text or copyright notice
exists in the inspected tree. The declared identifier is verified, but compliant
copying/distribution remains unresolved pending the canonical notice. The web SDK
does not depend on the npm client; compatibility belongs at the RGS/artifact/event
boundaries described in [blocking-question research](blocker-research.md).
