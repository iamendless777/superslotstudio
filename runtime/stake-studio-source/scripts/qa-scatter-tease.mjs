#!/usr/bin/env node
/**
 * Drive Play Motion 3-scatter, 5-scatter, then live 2-scatter.
 * Records reel-stop timestamps and screenshots for sequential-hold confirmation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.STAKE_STUDIO_URL || 'http://127.0.0.1:8080';
const OUT = process.env.QA_SCREENSHOT_DIR || '/workspace/screenshots';
mkdirSync(OUT, { recursive: true });

function gapOk(ms, hold = 1200) {
  return ms >= hold - 80 && ms <= hold + 450;
}

async function waitPreview(page) {
  await page.waitForSelector('#previewSpin, #previewMotionPlay, #welcomeScreen', { timeout: 20000 });
  const welcome = await page.locator('#welcomeScreen').count();
  const spin = await page.locator('#previewSpin').count();
  if (!spin && welcome) {
    throw new Error('Studio stayed on welcome — Morpheus project did not load.');
  }
  await page.waitForSelector('#previewMotionPlay', { timeout: 15000 });
  await page.waitForSelector('.reel-mask', { timeout: 15000 });
}

async function snapshotStops(page) {
  return page.evaluate(() => {
    const masks = [...document.querySelectorAll('.reel-mask')];
    return {
      at: performance.now(),
      stopped: masks.map((mask, reel) => ({
        reel,
        stopped: mask.classList.contains('has-stopped'),
        spinning: mask.classList.contains('is-spinning'),
        tease: mask.classList.contains('is-anticipation'),
      })),
      status: document.querySelector('#previewMotionStatus')?.textContent || '',
      debug: document.querySelector('#previewMotionDebug')?.textContent || '',
      last: window.__MOTION_LAST_PLAY__ || null,
    };
  });
}

async function watchStops(page, { label, timeoutMs = 12000, intervalMs = 40 } = {}) {
  const started = Date.now();
  const firstSeen = [];
  const seenSpinning = [];
  let lastStatus = '';
  let samples = 0;
  while (Date.now() - started < timeoutMs) {
    const snap = await snapshotStops(page);
    samples += 1;
    if (snap.status && snap.status !== lastStatus) lastStatus = snap.status;
    snap.stopped.forEach((reel) => {
      if (reel.spinning) seenSpinning[reel.reel] = true;
      const landed = reel.stopped || (seenSpinning[reel.reel] && !reel.spinning);
      if (landed && firstSeen[reel.reel] == null) firstSeen[reel.reel] = Date.now() - started;
    });
    if (firstSeen.filter((ms) => Number.isFinite(ms)).length === snap.stopped.length) break;
    await page.waitForTimeout(intervalMs);
  }
  const gaps = firstSeen.slice(1).map((ms, index) => (
    Number.isFinite(ms) && Number.isFinite(firstSeen[index]) ? ms - firstSeen[index] : null
  ));
  return { label, firstSeen, gaps, lastStatus, samples, durationMs: Date.now() - started };
}

async function playMotion(page, templateId, shotPrefix) {
  await page.selectOption('#previewMotionTemplate', templateId);
  await page.screenshot({ path: `${OUT}/${shotPrefix}-idle.png`, fullPage: false });
  await page.click('#previewMotionPlay');
  await page.waitForFunction(() => {
    const masks = [...document.querySelectorAll('.reel-mask')];
    return masks.some((mask) => mask.classList.contains('is-spinning'));
  }, { timeout: 4000 }).catch(() => {});
  const mid = await watchStops(page, { label: templateId, timeoutMs: 11000 });
  await page.screenshot({ path: `${OUT}/${shotPrefix}-landed.png` });
  return mid;
}

async function waitIdle(page) {
  await page.waitForFunction(() => {
    const masks = [...document.querySelectorAll('.reel-mask')];
    const spinning = masks.some((mask) => mask.classList.contains('is-spinning'));
    const status = document.querySelector('#previewMotionStatus')?.textContent || '';
    return !spinning && /Done|idle|^$/i.test(status.trim());
  }, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function playLiveTwo(page) {
  const before = await page.evaluate(() => ({
    spinning: [...document.querySelectorAll('.reel-mask')].some((mask) => mask.classList.contains('is-spinning')),
    stopped: [...document.querySelectorAll('.reel-mask')].filter((mask) => mask.classList.contains('has-stopped')).length,
    status: document.querySelector('#previewMotionStatus')?.textContent || '',
    balance: document.querySelector('#hudBalance')?.textContent || '',
  }));
  await page.click('#previewLiveTwoScatter');
  await page.waitForFunction((prevBalance) => {
    const masks = [...document.querySelectorAll('.reel-mask')];
    const spinning = masks.some((mask) => mask.classList.contains('is-spinning'));
    const stopped = masks.filter((mask) => mask.classList.contains('has-stopped')).length;
    const balance = document.querySelector('#hudBalance')?.textContent || '';
    return spinning || balance !== prevBalance || stopped < 6;
  }, before.balance, { timeout: 6000 });
  const mid = await watchStops(page, { label: 'live-2-scatter', timeoutMs: 11000 });
  await page.screenshot({ path: `${OUT}/live-2-scatter-landed.png` });
  const board = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.reel-sym')];
    const byReel = {};
    for (const cell of cells) {
      const reel = Number(cell.dataset.reel);
      if (!Number.isFinite(reel)) continue;
      byReel[reel] ||= [];
      const name = cell.dataset.symbol || cell.getAttribute('data-name') || cell.querySelector('img')?.alt || cell.textContent.trim();
      byReel[reel].push(name);
    }
    return {
      status: document.querySelector('#previewMotionStatus')?.textContent || '',
      debug: document.querySelector('#previewMotionDebug')?.textContent || '',
      last: window.__MOTION_LAST_PLAY__ || null,
      cells: byReel,
    };
  });
  return { ...mid, before, board };
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(`${BASE}/?panel=preview`, { waitUntil: 'domcontentloaded' });
await waitPreview(page);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/preview-loaded.png` });

const three = await playMotion(page, 'scatter-tease-3', 'play-3-scatter');
await waitIdle(page);
const five = await playMotion(page, 'scatter-tease-5', 'play-5-scatter');
await waitIdle(page);
const live = await playLiveTwo(page);

const waitingGaps = (result) => result.gaps.slice(2);
const report = {
  url: BASE,
  project: await page.locator('#projectName').innerText().catch(() => ''),
  three,
  five,
  live: {
    firstSeen: live.firstSeen,
    gaps: live.gaps,
    lastStatus: live.lastStatus,
    board: live.board,
  },
  threeWaitingGaps: waitingGaps(three),
  fiveWaitingGaps: waitingGaps(five),
  liveWaitingGaps: waitingGaps(live),
  sequentialHold: {
    three: waitingGaps(three).every((ms) => gapOk(ms)),
    five: waitingGaps(five).every((ms) => gapOk(ms)),
    live: waitingGaps(live).every((ms) => gapOk(ms)),
  },
  consoleErrors,
};
writeFileSync(`${OUT}/scatter-tease-qa.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = [];
if (!report.sequentialHold.three) failed.push('3-scatter waiting gaps not ~1200ms');
if (!report.sequentialHold.five) failed.push('5-scatter waiting gaps not ~1200ms');
if (!report.sequentialHold.live) failed.push('live 2-scatter waiting gaps not ~1200ms');
if (three.firstSeen.filter(Number.isFinite).length < 6) failed.push('3-scatter did not land all reels');
if (five.firstSeen.filter(Number.isFinite).length < 6) failed.push('5-scatter did not land all reels');
if (live.firstSeen.filter(Number.isFinite).length < 6) failed.push('live 2-scatter did not land all reels');
if (failed.length) {
  console.error('QA FAILED:\n' + failed.map((item) => `- ${item}`).join('\n'));
  await browser.close();
  process.exit(1);
}

await browser.close();
