#!/usr/bin/env node
/*
 * 1ファイルにまとめた版を作る（CSS と JS を埋め込み、外部ファイルなしで開ける）。
 *   node scripts/build-artifact.js <出力パス>
 * --fragment を付けると <html>/<head>/<body> を省いた本文だけを書き出す。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) || path.join(root, 'dist', 'lorebook-lab.html');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const js = scripts.map((s) => '<script>\n' + fs.readFileSync(path.join(root, s), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n');
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const body = html.split('<body>')[1].split('<script')[0];

const head = '<title>Lorebook Lab</title>\n' + fonts + '\n<style>\n' + css + '\n</style>\n';
const page = fragment
  ? head + body + js + '\n'
  : '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + head + '</head>\n<body>' + body + js + '\n</body>\n</html>\n';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(out + ' (' + Math.round(page.length / 1024) + ' KB)');
