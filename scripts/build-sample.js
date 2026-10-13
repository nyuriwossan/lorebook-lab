#!/usr/bin/env node
/*
 * samples/*.md を js/data/sample.js に埋め込む。
 * index.html をファイルとして直接開いても（fetch なしで）サンプルを読めるようにするため。
 *   node scripts/build-sample.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(root, 'samples', 'lorebook_v03.md'), 'utf8');

const sample = {
  fileName: 'lorebook_v03.md',
  markdown: md,
  userText: '久しぶり。……ごめん、急に来て。本当は、ずっと会いたかったんだ。',
  aiText: '彼女は一瞬言葉に詰まり、それから小さく微笑んだ。「ささやかな歓迎しかできないけど」と囁き、指先で髪に触れる。窓の外では雨音が強くなっていた。'
};

const out = '/* 自動生成ファイル: node scripts/build-sample.js で更新 */\n' +
  '(function (g) { g.LL = g.LL || {}; g.LL.sample = ' + JSON.stringify(sample, null, 2) + '; })(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
fs.writeFileSync(path.join(root, 'js', 'data', 'sample.js'), out);
console.log('js/data/sample.js を更新しました');
