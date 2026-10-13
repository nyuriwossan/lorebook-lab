'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ch = require('../js/core/chain.js');
const { loadV03, lb } = require('./helpers.js');

const book = lb([{ title: 'A', keywords: ['涙'] }, { title: 'B', keywords: ['微笑'] }, { title: 'C', keywords: ['雨'] }]);

test('一致は次のAI生成1回にだけ影響する', () => {
  const r = ch.analyzeTurns([
    { role: 'user', text: '涙が出た' },
    { role: 'ai', text: '彼女は微笑んだ' },
    { role: 'user', text: 'うん' },
    { role: 'ai', text: '静かだ' }
  ], book.entries);
  assert.deepEqual(r.rows[1].influences.map((x) => x.entry.title), ['A']);
  // 2回目のAI生成：前回AI生成の「微笑」だけが影響候補（Aは持ち越さない）
  assert.deepEqual(r.rows[3].influences.map((x) => x.entry.title), ['B']);
  assert.equal(r.rows[3].influences[0].fromAiOnly, true);
  assert.equal(r.pending.length, 0);
});

test('ユーザー発言とAI生成の両方から来た候補をまとめる', () => {
  const r = ch.analyzeTurns([
    { role: 'ai', text: '雨が降る' },
    { role: 'user', text: '雨だね、涙みたい' },
    { role: 'ai', text: '……' }
  ], book.entries);
  const inf = r.rows[2].influences;
  assert.deepEqual(inf.map((x) => x.entry.title), ['C', 'A']);
  assert.equal(inf[0].sources.length, 2);
  assert.equal(inf[0].fromAiOnly, false);
});

test('同じ項目が続けて影響する連続回数と、最後の未消化候補', () => {
  const r = ch.analyzeTurns([
    { role: 'user', text: '微笑' },
    { role: 'ai', text: '微笑' },
    { role: 'user', text: '' },
    { role: 'ai', text: '微笑' },
    { role: 'user', text: '' },
    { role: 'ai', text: '微笑' }
  ], book.entries);
  assert.equal(r.rows[1].influences[0].streak, 1);
  assert.equal(r.rows[3].influences[0].streak, 2);
  assert.equal(r.rows[5].influences[0].streak, 3);
  assert.equal(r.rows[5].influences[0].reappears, true);
  assert.deepEqual(r.pending.map((x) => x.entry.title), ['B']);
  assert.equal(r.summary.longStreakEntryIds.length, 1);
});

test('サンプル会話をv0.3で分析できる', () => {
  const v = loadV03();
  const r = ch.analyzeTurns(ch.sampleTurns(), v.entries);
  assert.equal(r.rows.length, 6);
  const first = r.rows[1].influences.map((x) => x.entry.title);
  assert.deepEqual(first, ['別れと再会']);
  assert.ok(r.rows[3].influences.some((x) => x.entry.title === '表情の細部' && x.fromAiOnly));
});
