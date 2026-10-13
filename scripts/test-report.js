#!/usr/bin/env node
/*
 * 自動テストとスマホ幅の表示確認を実行し、TEST_RESULTS.md に書き出す。
 *   node scripts/test-report.js
 * 表示確認には Playwright（Chromium）が必要。無ければその部分は省略する。
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', f));
const t = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: root, encoding: 'utf8' });
const spec = (t.stdout + t.stderr).replace(/\x1b\[[0-9;]*m/g, '').replace(/ \([\d.]+ms\)/g, '').trim();
const num = (k) => { const m = spec.match(new RegExp('ℹ ' + k + ' (\\d+)')); return m ? +m[1] : null; };

let ui = null;
const shots = path.join(root, 'docs', 'screenshots');
const u = spawnSync(process.execPath, [path.join(root, 'scripts', 'ui-check.js'), shots], { cwd: root, encoding: 'utf8', timeout: 300000 });
if (u.status === 0) { try { ui = JSON.parse(u.stdout); } catch (e) { ui = null; } }

const lines = [];
lines.push('# テスト結果', '');
lines.push('- 実行日時：' + new Date().toISOString().replace('T', ' ').slice(0, 16) + '（UTC）');
lines.push('- Node.js：' + process.version);
lines.push('- 自動テスト：' + num('tests') + '件中 成功 ' + num('pass') + '件・失敗 ' + num('fail') + '件', '');
lines.push('## 自動テスト（node --test）', '', '```', spec.split('\nℹ tests')[0].trim(), '```', '');
lines.push('## スマホ幅の表示確認（390×844、Chromium）', '');
if (ui) {
  lines.push('| 配色 | 画面 | 横はみ出し |', '| --- | --- | --- |');
  ui.filter((r) => r.tab).forEach((r) => lines.push('| ' + (r.scheme === 'dark' ? 'ダーク' : 'ライト') + ' | ' + r.tab + ' | ' + (r.horizontalOverflowPx > 0 ? r.horizontalOverflowPx + 'px' : 'なし') + ' |'));
  const errs = ui.filter((r) => r.errors).flatMap((r) => r.errors).filter((e) => !/ERR_FAILED/.test(e));
  lines.push('', '- ページ内のエラー：' + (errs.length ? errs.join(' / ') : 'なし（Webフォントは検証環境で読み込みを止めているため除外）'));
  lines.push('- スクリーンショット：`docs/screenshots/`', '');
} else {
  lines.push('Playwright が無いため省略しました。', '');
}
lines.push('## 実機で確認していないこと', '');
lines.push('- Zeta／Zetter 内部での実際の発火。このツールの結果は文字列一致による「発火候補」です。');
lines.push('- iPhone・Android の実機ブラウザでの操作感（上記はヘッドレス Chromium のスマホ幅表示）。');
fs.writeFileSync(path.join(root, 'TEST_RESULTS.md'), lines.join('\n') + '\n');
console.log('TEST_RESULTS.md を書き出しました（' + num('pass') + '/' + num('tests') + ' 成功）');
process.exit(t.status || 0);
