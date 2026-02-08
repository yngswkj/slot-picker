const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP_URL = 'file:///C:/Users/yngsw/dev/slot-picker/index.html';
const OUT_DIR = 'C:/Users/yngsw/dev/slot-picker/_review/visual';

const ITEMS = [
  'Hyper Drive',
  'Nebula Key',
  'Pixel Crown',
  'Quantum Card',
  'Ion Gear',
  'Meteor Pass',
  'Nova Ticket',
  'Prism Token',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addItems(page) {
  for (const item of ITEMS) {
    await page.fill('#item-input', item);
    await page.click('#add-btn');
  }
}

async function preparePage(page) {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await addItems(page);
}

async function captureScenario(browser, name, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await preparePage(page);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}-ready.png`),
    fullPage: true,
  });

  await page.click('#start-btn');
  await sleep(1800);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}-running.png`),
    fullPage: true,
  });

  await page.waitForSelector('#modal-close.visible', { timeout: 12000 });
  await sleep(100);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}-result.png`),
    fullPage: true,
  });

  await context.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
  });

  try {
    await captureScenario(browser, 'desktop', { width: 1366, height: 900 });
    await captureScenario(browser, 'mobile', { width: 390, height: 844 });
    console.log(`Captured screenshots to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
})();
