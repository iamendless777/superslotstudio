# Stake Engine version and compatibility matrix

All observations were retrieved at **2026-07-26T10:12:01Z**.

| Component        | Official URL                                     | Tag/release inspected                 | Immutable SHA                                                                                       | Package/version                                       | Toolchain                                                                                                                                                                                                                                                                     | License evidence                                                                                                                                                       | Compatibility status                                                  |
| ---------------- | ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Web SDK          | <https://github.com/StakeEngine/web-sdk>         | None exists; current commit inspected | [`1843d60`](https://github.com/StakeEngine/web-sdk/tree/1843d60cedb94b390e641b563f32ad64353bec5e)   | root `twist-turbo@0.0.0`, private                     | Node `>=22.16.0`; pnpm `10.5.0` ([manifest](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/package.json#L1-L31))                                                                                                                        | manifests say MIT; **license text absent**                                                                                                                             | **UNVERIFIED**                                                        |
| Math SDK         | <https://github.com/StakeEngine/math-sdk>        | None exists; current commit inspected | [`600a376`](https://github.com/StakeEngine/math-sdk/tree/600a37657c75d67c0412bf3952a01d7e7ee99987)  | setuptools `stakeengine==0.0.0`; not verified on PyPI | Python `>=3.12`; Rust/Cargo for optimizer ([setup](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/setup.py#L1-L10), [README](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/README.md#L12-L21)) | MIT with notice-preservation and warranty disclaimer ([license](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/LICENSE#L1-L21)) | **UNVERIFIED**                                                        |
| TS client source | <https://github.com/StakeEngine/ts-client>       | None exists; current commit inspected | [`df9e126`](https://github.com/StakeEngine/ts-client/tree/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e) | `stake-engine@0.1.32`                                 | Build uses TypeScript `^5.9.2`; no consumer `engines`/peer declarations ([manifest](https://github.com/StakeEngine/ts-client/blob/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e/package.json#L1-L36))                                                                              | manifest says ISC; **license text absent**                                                                                                                             | source manifest matches npm version; cross-SDK support **UNVERIFIED** |
| TS client npm    | <https://registry.npmjs.org/stake-engine/0.1.32> | exact `0.1.32` tarball                | npm SHA-1 `b0c83d3e5e0e1fd31a849cd4294b26c44fab94c5`                                                | `stake-engine@0.1.32`                                 | no `engines`, dependencies, or peers                                                                                                                                                                                                                                          | registry says ISC; text absent in tarball                                                                                                                              | Candidate only; dependency addition blocked                           |

## Verified compatibility observations

- Web SDK is described as optional and static-site oriented; it is a reference
  codebase rather than a versioned library release ([README](https://github.com/StakeEngine/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/README.md#L1-L7)).
- Math books' `events` are returned by the RGS play response and are intended for
  frontend interpretation ([quick start](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/docs/math_docs/quickstart.md#L39-L94)).
- The web repository does not depend on the npm `stake-engine` client; it uses
  local RGS request workspaces. The npm client is separately described as an
  optional simplification in the [official RGS documentation](https://stake-engine.com/docs/rgs).
- There is no evidence that all three repositories must be installed together.
  Compatibility is enforced at RGS protocol, math artifact, and game-event schema
  boundaries; no vendor-tested release matrix is published.

## Conflict log

- The math SDK repository's `requirements.txt` self-reference pins older commit
  `0842bb2...`, while the inspected repository HEAD is `600a376...`
  ([requirements](https://github.com/StakeEngine/math-sdk/blob/600a37657c75d67c0412bf3952a01d7e7ee99987/requirements.txt#L1)). Treat the file as a stale bootstrap pin, not a compatibility declaration.
- Approval guidance says all mode RTPs must be 90.0%–96.70%, then gives a
  variation example whose base RTP is 97%. This inconsistency requires Stake
  Engine clarification; the stricter explicit range remains the release gate.
- The approval language table uses `po` for Polish, while both the official RGS
  details and TypeScript source use ISO 639-1 `pl`. Use `pl` for integration and
  retain the approval-page inconsistency for Stake Engine correction.
