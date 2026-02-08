const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const url = 'file:///C:/Users/yngsw/dev/slot-picker/index.html';
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });

  const items = ['いぬ', 'ねこ', 'とり', 'りんご', 'ぶどう', 'さかな'];
  for (const item of items) {
    await page.fill('#item-input', item);
    await page.click('#add-btn');
  }

  await page.evaluate(() => {
    const realRandom = Math.random;
    let calls = 0;
    Math.random = () => {
      calls += 1;
      if (calls === 1) return 0.2;  // winnerIndex
      if (calls === 2) return 0.5;  // winningLine => diagonal [0,1,2]
      return realRandom();
    };
  });

  await page.click('#start-btn');
  await page.waitForSelector('#modal-close.visible', { timeout: 12000 });
  await page.waitForTimeout(120);

  const out = 'C:/Users/yngsw/dev/slot-picker/_review/visual/desktop-result-diagonal-check.png';
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);

  await browser.close();
})();
