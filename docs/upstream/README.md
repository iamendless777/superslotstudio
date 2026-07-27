# Milestone 0 upstream source ledger

Status: **complete for source discovery; integration remains blocked pending the
open questions below**. Retrieved 2026-07-26T10:12:01Z.

This directory separates four kinds of statements:

- **Verified fact** — supported by an official page or a GitHub permalink at the
  inspected commit.
- **Decision** — a local Super Slot Studio architectural constraint, recorded in
  an ADR.
- **Assumption** — a temporary planning premise that must not become an API
  contract without validation.
- **Open question** — requires an answer from Stake Engine.

## Source-of-truth order

1. Versioned Stake Engine release artifact and its contents.
2. Official documentation and approval guidelines.
3. Source pinned to an immutable Stake Engine commit.
4. npm registry metadata for the exact published artifact.
5. Local decisions and assumptions, which never override upstream facts.

Conflicts are recorded rather than silently reconciled. The approval site is
mutable, so every approval citation includes the retrieval time; unlike GitHub
source, it cannot currently be pinned to a public revision.

## Provenance summary

| Source                                                | Inspected revision                                                   | Archive SHA-256                                                    | Publication status                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| [web-sdk](https://github.com/StakeEngine/web-sdk)     | commit `1843d60cedb94b390e641b563f32ad64353bec5e` (no tags/releases) | `25572c1d06ef175e5723b21a721866032b643d729839fe0d26364ca6f6d7402b` | private workspace, `0.0.0`; not an installable release      |
| [math-sdk](https://github.com/StakeEngine/math-sdk)   | commit `600a37657c75d67c0412bf3952a01d7e7ee99987` (no tags/releases) | `6b0f66a024ff6ffca70f83de866e2592b0ce64c5c4721dfcbc7d1d6c5cb05eae` | setuptools name `stakeengine`, `0.0.0`; no release verified |
| [ts-client](https://github.com/StakeEngine/ts-client) | commit `df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e` (no tags/releases) | `7232856fe165dada18023401bb8c40058555c4169840894524c90f9f6189805f` | npm `stake-engine@0.1.32`                                   |
| npm artifact                                          | `stake-engine@0.1.32`                                                | `55c2445e5aa0744dafef9d54f74b9f6ae2857dcfc868a14460a053a60cec4869` | registry `latest` at retrieval                              |

Archives were downloaded from GitHub's commit archive endpoint or the exact npm
tarball URL and hashed locally. A hash authenticates the retrieved bytes; it is
not a vendor signature. GitHub's API reported no tags and no releases for all
three repositories at retrieval.

## Repository baseline and review audit

The supplied branch contained only `.gitkeep`. There was no root `AGENTS.md`,
`docs/` directory, configured remote, prior documentation PR, or review-comment
artifact to search. Consequently these documents are a clean Milestone 0
capture, not an edit of recoverable prior prose. This is an **open provenance
gap** if an earlier PR exists elsewhere.

## Blocking open questions

Follow-up research resolved the package relationship, six-decimal money scale,
Polish RGS language code, active-round flow, and an operational policy for
ambiguous responses. Full evidence and corrections are in
[blocking-question research](blocker-research.md). A staging-only
[failure-injection plan](failure-injection-test-plan.md) will validate the policy
when an authorized session exists.

1. What canonical license text/copyright notice applies to the web SDK's declared
   MIT license and the TypeScript client's declared ISC license?
2. The client package lacks an `engines` field. Which browser and Node/TypeScript
   versions are supported for consumers?
3. Can Stake Engine provide a versioned or dated approval-guideline artifact and
   correct the RTP/Polish-code conflicts?

No Stake Engine dependency may be added until its license and exact integration
contract are accepted.
