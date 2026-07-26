# Risk register

| ID    | Risk / evidence                                                         | Impact                         | Mitigation / owner                                           | Status                 |
| ----- | ----------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ | ---------------------- |
| R-001 | No upstream tags/releases or published cross-SDK matrix                 | incompatible integration       | Protocol/artifact boundaries; exact pins; contract tests     | Controlled             |
| R-002 | Web history declares MIT but canonical notice/text is absent            | non-compliant redistribution   | obtain canonical license file/holder; do not copy            | Open/blocking          |
| R-003 | Client says ISC but license text absent in git/npm tarball              | distribution risk              | obtain canonical license text before dependency              | Open/blocking          |
| R-004 | Client has no retry/idempotency/timeout/reconnect contract              | duplicate/stranded wager       | no mutation retry; Authenticate reconciliation; staging test | Controlled/unverified  |
| R-005 | Happy-path and reference resume behavior are documented                 | unfinished/duplicate round     | ADR 0004; restore authoritative active round                 | Controlled/unverified  |
| R-006 | Approval site mutable/unversioned and trust-level checklist login-gated | stale/non-compliant submission | date snapshots; live recheck; request export                 | Open                   |
| R-007 | RTP range conflicts with its own 97% example                            | rejection                      | enforce stricter explicit bound pending answer               | Open                   |
| R-008 | Approval says `po`; RGS/client say ISO `pl`                             | approval/localization mismatch | use `pl`; ask approval team to correct guidance              | Controlled/open        |
| R-009 | RGS confirms six-decimal integer scale                                  | overflow/rounding defect       | integer domain; safe-range and display validation            | Controlled             |
| R-010 | Sample assets/code mistaken for approved product API                    | IP/review/rework               | reference only; original assets; narrow adapters             | Controlled             |
| R-011 | Large/insufficient math artifact set                                    | publish failure/repetition     | enforce 4.2 GB/10m and statistical gates                     | Open until math exists |
| R-012 | Internal testing described as approval                                  | compliance/reputation          | explicit language gate; only Stake Engine approves           | Controlled             |
| R-013 | Branch lacked promised prior docs/review comments                       | missed decision/comment        | disclose baseline; locate earlier PR before M1               | Open                   |
| R-014 | Polling interval has no disposal API                                    | leak/duplicate polling         | adapter lifecycle design or vendor fix                       | Open                   |

Review this register at every milestone gate and before every upstream upgrade.
