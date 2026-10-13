'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const p = require('../js/core/parser.js');

const v03md = fs.readFileSync(path.join(__dirname, '..', 'samples', 'lorebook_v03.md'), 'utf8');

test('v0.3：名前・版・29項目を読み込む', () => {
  const r = p.parseMarkdown(v03md);
  assert.equal(r.version, 'v0.3');
  assert.equal(r.name, '場面連動型・描写演出ロアブック（推奨・1文字キーワード含む）');
  assert.equal(r.entries.length, 29);
  assert.deepEqual(r.warnings, []);
});

test('v0.3：全項目がキーワード5個・本文あり・番号は01〜29', () => {
  const r = p.parseMarkdown(v03md);
  r.entries.forEach((e, i) => {
    assert.equal(e.keywords.length, 5, e.title);
    assert.ok(e.body.length > 20, e.title);
    assert.equal(e.no, String(i + 1).padStart(2, '0'));
  });
});

test('v0.3：個別項目の内容', () => {
  const r = p.parseMarkdown(v03md);
  const e1 = r.entries[0];
  assert.equal(e1.title, '表情の細部');
  assert.equal(e1.category, 'Ⅰ｜人物の表現');
  assert.deepEqual(e1.keywords, ['微笑', '苦笑', '表情', '口元', '眉を']);
  assert.ok(e1.body.startsWith('感情が顔に表れる場面では'));
  assert.ok(e1.body.endsWith('台詞で十分伝わる場面では補わない。'));
  const e3 = r.entries[2];
  assert.deepEqual(e3.keywords, ['囁', 'ささや', '呟', '叫', '小声']);
  const e28 = r.entries[27];
  assert.equal(e28.title, '緊迫と危機');
  assert.equal(e28.category, 'Ⅴ｜場面の進行');
  assert.deepEqual(e28.keywords, ['危ない', '逃げ', '襲', '斬', '構え']);
  assert.ok(r.entries[15].body.includes('挨拶代わりの軽い「ごめん」'));
});

test('v0.3：ロアブック外の注記は項目にせずメモに残す', () => {
  const r = p.parseMarkdown(v03md);
  assert.ok(!r.entries.some((e) => e.title.includes('常設プロット')));
  assert.ok(r.notes.includes('【描写の配分】'));
  assert.ok(r.notes.includes('使用上の注意'));
  assert.ok(!r.entries[28].body.includes('常設プロット'));
  assert.ok(!r.notes.includes('## Ⅰ｜人物の表現'));
});

test('書き出し → 再読み込みで項目が一致する（往復）', () => {
  const lb = p.toLorebook(p.parseMarkdown(v03md));
  const md2 = p.toMarkdown(lb);
  const r2 = p.parseMarkdown(md2);
  assert.equal(r2.entries.length, 29);
  r2.entries.forEach((e, i) => {
    const o = lb.entries[i];
    assert.equal(e.title, o.title);
    assert.equal(e.no, o.no);
    assert.equal(e.category, o.category);
    assert.deepEqual(e.keywords, o.keywords);
    assert.equal(e.body, o.body);
  });
  assert.equal(r2.version, 'v0.3');
});

test('AIが崩した形式も読める（コードブロック・半角コロン・箇条書き・括弧）', () => {
  const md = [
    '```markdown',
    '# 心理深化ロアブック ver0.1',
    '',
    '### 1. 内的葛藤',
    '- キーワード: 「迷い」, 葛藤 / 揺れ',
    '- 本文: 一行目。',
    '二行目。',
    '',
    '### 罪悪感',
    '**キーワード：**',
    '- 罪悪感',
    '- 後ろめた',
    '**本文：**',
    '本文は次の行から。',
    '**備考：** これは本文に入れない',
    '```'
  ].join('\n');
  const r = p.parseMarkdown(md);
  assert.equal(r.name, '心理深化ロアブック');
  assert.equal(r.version, 'v0.1');
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0].no, '1');
  assert.equal(r.entries[0].title, '内的葛藤');
  assert.deepEqual(r.entries[0].keywords, ['迷い', '葛藤', '揺れ']);
  assert.equal(r.entries[0].body, '一行目。\n二行目。');
  assert.deepEqual(r.entries[1].keywords, ['罪悪感', '後ろめた']);
  assert.equal(r.entries[1].body, '本文は次の行から。');
});

test('上限超過・空キーワード・重複を警告する', () => {
  const md = [
    '# テスト',
    '### 01｜多すぎ',
    '**キーワード：** a、b、c、d、e、f',
    '**本文：** x',
    '### 02｜空',
    '**キーワード：**',
    '**本文：** y',
    '### 03｜重複',
    '**キーワード：** 涙、涙',
    '**本文：**'
  ].join('\n');
  const r = p.parseMarkdown(md);
  const msgs = r.warnings.map((w) => w.message).join('\n');
  assert.match(msgs, /多すぎ：キーワードが6個/);
  assert.match(msgs, /空：キーワードがありません/);
  assert.match(msgs, /重複：キーワード「涙」が重複/);
  assert.match(msgs, /重複：本文が空/);
  assert.deepEqual(r.entries[0].keywords, ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('JSON：Lorebook Lab形式の書き出しと読み込み', () => {
  const lb = p.toLorebook(p.parseMarkdown(v03md));
  const json = p.exportJSON({ lorebooks: [lb], cases: [{ text: 'x' }] });
  const r = p.parseJSON(json);
  assert.equal(r.lorebooks.length, 1);
  assert.equal(r.lorebooks[0].entries.length, 29);
  assert.deepEqual(r.lorebooks[0].entries[0].keywords, lb.entries[0].keywords);
  assert.notEqual(r.lorebooks[0].id, lb.id);
  assert.deepEqual(r.extras.cases, [{ text: 'x' }]);
});

test('JSON：単体ロアブックや項目配列も読める', () => {
  const r1 = p.parseJSON(JSON.stringify({ name: 'A', entries: [{ title: 'x', keywords: '涙、泣', body: 'b' }] }));
  assert.deepEqual(r1.lorebooks[0].entries[0].keywords, ['涙', '泣']);
  const r2 = p.parseJSON(JSON.stringify([{ name: 'y', keys: ['叫'], content: 'c' }]));
  assert.equal(r2.lorebooks[0].entries[0].title, 'y');
  assert.equal(r2.lorebooks[0].entries[0].body, 'c');
  assert.throws(() => p.parseJSON('{"foo":1}'));
});

test('AI用の指示文は、その例をそのまま読み込める', () => {
  const prompt = p.aiPrompt();
  const example = prompt.split('【形式】')[1].split('【ルール】')[0];
  const r = p.parseMarkdown(example);
  assert.equal(r.entries.length, 1);
  assert.deepEqual(r.entries[0].keywords, ['語1', '語2', '語3', '語4', '語5']);
});

test('英字付きの番号（A01｜…）も番号として読む', () => {
  const r = p.parseMarkdown('# 獣人 v1.0\n### A01｜繁殖期と発情周期\n**キーワード：** 発情、繁殖期、ヒート、盛り、排卵\n**本文：** x');
  assert.equal(r.entries[0].no, 'A01');
  assert.equal(r.entries[0].title, '繁殖期と発情周期');
  assert.deepEqual(p.splitHeading('B12 | 嗅覚'), { no: 'B12', title: '嗅覚' });
  assert.deepEqual(p.splitHeading('光る体'), { no: '', title: '光る体' });
});
