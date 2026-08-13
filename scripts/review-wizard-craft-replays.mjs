import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PLAYBACK_PROFILES,
  cueFor,
  eventDelay,
} from "../demo/wizard-craft/cues.js";

const replayDirectory = resolve("demo/wizard-craft/replays");
const names = (await readdir(replayDirectory))
  .filter((name) => name.endsWith(".json") && name !== "catalog.json")
  .sort();

let failures = 0;
const fail = (name, message) => {
  failures += 1;
  console.error(`FAIL ${name}: ${message}`);
};

for (const name of names) {
  const book = JSON.parse(await readFile(resolve(replayDirectory, name), "utf8"));
  const events = book.events;
  let featureSpin = 0;
  let tier = null;
  let firstStickySpin = null;
  const temporary = new Set();
  const eventTypes = new Set(events.map((event) => event.type));
  const duel = events.find((event) => event.type === "startDuel");
  const stickyClaims = events.filter(
    (event) => event.type === "expandVsReel" && event.persistence === "sticky",
  );

  events.forEach((event, position) => {
    if (event.index !== position) fail(name, `event ${position} has index ${event.index}`);
    try {
      cueFor(event);
    } catch (error) {
      fail(name, error instanceof Error ? error.message : String(error));
    }
    for (const profile of Object.keys(PLAYBACK_PROFILES)) {
      if (eventDelay(event, profile) < PLAYBACK_PROFILES[profile].minimum) {
        fail(name, `${event.type} violates ${profile} minimum timing`);
      }
    }

    if (event.type === "startDuel") tier = event.tier;
    if (event.type === "reveal" && event.gameType === "freegame") featureSpin += 1;
    if (event.type === "reveal") {
      event.anticipation.forEach((amount, reel) => {
        if (amount <= 0) return;
        const priorScatters = event.board
          .slice(0, reel)
          .flat()
          .filter((symbol) => symbol.scatter).length;
        if (priorScatters < 2) {
          fail(name, `dishonest anticipation on reel ${reel + 1}`);
        }
      });
    }
    if (event.type === "expandVsReel") {
      if (event.persistence === "sticky") {
        firstStickySpin ??= featureSpin;
      } else {
        temporary.add(event.reel);
      }
    }
    if (event.type === "clearSpinReels") temporary.clear();
  });

  if (temporary.size > 0) fail(name, "temporary VS reel survives the book");
  if (tier === 3 && (firstStickySpin === null || firstStickySpin > 3)) {
    fail(name, "Tier III does not visibly claim a sticky by spin three");
  }
  if (name.includes("tier-one") && duel?.tier !== 1) {
    fail(name, "named Tier I proof does not enter Tier I");
  }
  if (name.includes("tier-two") && duel?.tier !== 2) {
    fail(name, "named Tier II proof does not enter Tier II");
  }
  if (name.includes("no-sticky") && stickyClaims.length !== 0) {
    fail(name, "named no-sticky proof contains a sticky claim");
  }
  if (name.includes("tier-two-sticky") && stickyClaims.length === 0) {
    fail(name, "named sticky proof contains no sticky claim");
  }
  if (name.includes("sticky-upgrade") && !eventTypes.has("upgradeStickyReel")) {
    fail(name, "named upgrade proof contains no sticky upgrade");
  }
  if (name.includes("retrigger") && !eventTypes.has("freeSpinRetrigger")) {
    fail(name, "named retrigger proof contains no retrigger");
  }
  if (name.includes("max-win")) {
    if (!eventTypes.has("wincap") || book.payoutMultiplier !== 2_500_000) {
      fail(name, "named maximum-win proof does not reach the 25,000x cap");
    }
  }

  const seconds = Object.fromEntries(
    Object.keys(PLAYBACK_PROFILES).map((profile) => [
      profile,
      (events.reduce((total, event) => total + eventDelay(event, profile), 0) / 1000)
        .toFixed(1),
    ]),
  );
  console.log(
    `PASS ${name}: ${events.length} events, normal ${seconds.normal}s, fast ${seconds.fast}s`,
  );
}

if (failures > 0) {
  console.error(`${failures} replay review failure(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${names.length} replay books across ${Object.keys(PLAYBACK_PROFILES).length} timing profiles`);
}
