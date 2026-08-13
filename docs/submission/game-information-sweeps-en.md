# Classic Nine: Signal Nine — game information (sweeps English)

Status: **production-copy specification for `social=true`; frontend
implementation and visual QA pending**.

## How to play

Classic Nine scans a 3×3 signal grid. Select a play amount, choose a mode, and
press Play. The three horizontal rows and two corner-to-corner diagonals are the
five active lines.

Three matching regular symbols on an active line award the amount shown in the
paytable. Core is wild and substitutes for every regular symbol, but not Portal.
If Core can complete more than one symbol match on a line, the highest valid
award is used. Awards on different lines are added.

Portal is the feature symbol. Three or more Portals anywhere in the base grid
trigger Deep Signal. Portal has no separate symbol award.

All plays are independent. Feature state and multipliers end with the current
play and never carry into another play.

## Paytable

Awards are multipliers of the base play amount for three symbols on an active
line.

| Symbol | Three symbols |
| ------ | ------------: |
| Pulse | 0.5× |
| Prism | 0.8× |
| Orbit | 1.2× |
| Beacon | 2.0× |
| Nova | 4.0× |
| Crown | 8.0× |
| Core | 12.0× |
| Portal | Feature trigger only |

## Deep Signal

- Three or more Portals in the base game award nine free scans.
- Three or more Portals during Deep Signal add three free scans.
- The center position is a Core wild on every free scan.
- The amplifier starts at 1×.
- After a free scan with a line win, the amplifier increases by 1×.
- The amplifier can take every whole value from 1× through 9×.
- The current amplifier multiplies all line awards from that scan.
- Deep Signal ends when no free scans remain or the 10,000× win cap is reached.

## Modes

| Mode | Play amount | RTP | Maximum win | Access |
| ---- | ----------: | --: | ----------: | ------ |
| Base | 1× base play amount | 96.50% | 10,000× base play amount | Standard play |
| Deep Signal | 100× base play amount | 96.50% | 10,000× base play amount | Feature starts immediately |

Deep Signal is unavailable when instant feature access is disabled by
jurisdiction settings.

RTP is the expected return measured over many plays. Individual sessions can
vary substantially.

## Controls

- **Play:** starts one play at the selected play amount and mode.
- **Play amount selector:** chooses an amount allowed by the game server.
- **Mode selector:** switches between Base and Deep Signal when permitted.
- **Automatic play:** opens a confirmation screen before any automatic sequence
  begins.
- **Turbo / Super Turbo:** changes presentation speed when permitted; results do
  not change.
- **Spacebar:** starts a play when keyboard play is permitted and no dialog or
  input control has focus.
- **Sound:** enables or mutes game audio.
- **Fullscreen:** enters or leaves fullscreen when permitted.
- **Information:** opens these rules, paytable, RTP, mode play amounts, and
  controls.

Unavailable controls must be hidden or disabled according to the server's
jurisdiction settings.

## Settlement and disconnection

The Remote Game Server selects and settles every result. The browser only
presents the returned events. If a play is interrupted, reload the game to
resume the authoritative result before starting another play.

## Disclaimer

Malfunction voids all wins and plays. A consistent internet connection is
required. In the event of a disconnection, reload the game to finish any
uncompleted rounds. The expected return is calculated over many plays. The game
display is not representative of any physical device and is for illustrative
purposes only. Winnings are settled according to the amount received from the
Remote Game Server and not from events within the web browser. TM and © 2026
Stake Engine.
