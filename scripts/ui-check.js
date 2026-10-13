#!/usr/bin/env node
/*
 * スマホ幅での表示確認（Playwright）
 *   node scripts/ui-check.js <出力フォルダ>
 * 各タブのスクリーンショットを撮り、コンソールエラーと横スクロールの有無を報告する。
 */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const root = path.join(__dirname, '..');
const outDir = process.argv[2] || path.join(root, 'docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (types[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch();
  const report = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(url);
    await page.waitForSelector('#sim-out .specimen');
    for (const tab of ['sim', 'audit', 'compare', 'chain', 'manage']) {
      await page.click('.tab[data-tab="' + tab + '"]');
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = path.join(outDir, scheme + '-' + tab + '.png');
      await page.screenshot({ path: file, fullPage: tab !== 'manage' ? false : false });
      report.push({ scheme, tab, horizontalOverflowPx: overflow });
    }
    // 監査の下位画面
    await page.click('.tab[data-tab="audit"]');
    for (const v of ['records', 'design']) {
      await page.click('#audit-seg button[data-v="' + v + '"]');
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(outDir, scheme + '-audit-' + v + '.png') });
      report.push({ scheme, tab: 'audit/' + v, horizontalOverflowPx: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) });
    }
    report.push({ scheme, errors });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
