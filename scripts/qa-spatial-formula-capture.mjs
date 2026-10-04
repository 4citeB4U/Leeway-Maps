#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APP_URL = opt('--url', 'http://localhost:4173');
const OUT = opt('--out', 'artifacts/spatial-density/live-trace.json');
const HEADFUL = argv.includes('--headful');
const TIMEOUT_MS = Math.max(60_000, Number(opt('--timeout-ms', '240000')) || 240000);

function measuredUrl(raw) {
  const url = new URL(raw);
  url.searchParams.set('spatialMeasure', '1');
  return url.toString();
}

async function setView(page, { lat, lon, height }) {
  await page.evaluate(({ lat, lon, height }) => {
    const gev = window.__godsEyeView;
    const radians = Math.PI / 180;
    gev.viewer.camera.setView({
      destination: gev.viewer.scene.globe.ellipsoid.cartographicToCartesian({
        longitude: lon * radians,
        latitude: lat * radians,
        height,
      }),
      orientation: {
        heading: 0,
        pitch: -Math.PI / 2,
        roll: 0,
      },
    });
    gev.viewer.camera.changed.raiseEvent();
    gev.viewer.camera.moveEnd.raiseEvent();
  }, { lat, lon, height });
}

async function clickByText(page, text) {
  return page.evaluate((label) => {
    const nodes = [...document.querySelectorAll('button')];
    const button = nodes.find((node) => node.textContent?.trim().includes(label));
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
      ...(HEADFUL ? [] : ['--use-gl=angle', '--use-angle=swiftshader']),
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(measuredUrl(APP_URL), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction(
      () =>
        window.__godsEyeView?.viewer &&
        window.__leewaySpatialTelemetry?.enabled === true,
      { timeout: 60_000 },
    );

    // Milwaukee: direct MCTS + mapped network + business density.
    await setView(page, { lat: 43.0389, lon: -87.9065, height: 1800 });
    await clickByText(page, 'Transit');
    await clickByText(page, 'Places');

    // Generate real interaction-latency samples without inventing values.
    for (let i = 0; i < 4; i += 1) {
      await clickByText(page, 'Places');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await clickByText(page, 'Places');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await page.waitForFunction(
      () => window.__leewaySpatialTelemetry.getRows().length >= 16,
      { timeout: TIMEOUT_MS, polling: 1000 },
    );

    const trace = await page.evaluate(() =>
      window.__leewaySpatialTelemetry.exportTrace(),
    );
    const complete = trace.observations.filter((row) => row.complete);
    if (complete.length < 16)
      throw new Error('SPATIAL_16_COMPLETE_OBSERVATIONS_REQUIRED');

    trace.capture = {
      appUrl: APP_URL,
      browserMode: HEADFUL ? 'headful' : 'headless',
      qualification:
        HEADFUL
          ? 'REAL_GPU_CANDIDATE'
          : 'SOFTWARE_GL_RELATIVE_ONLY',
      completeObservationCount: complete.length,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(trace, null, 2) + '\n');
    console.log(JSON.stringify({
      status: 'SPATIAL_TRACE_CAPTURED',
      out: OUT,
      completeObservationCount: complete.length,
      qualification: trace.capture.qualification,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 2;
});
