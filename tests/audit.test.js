'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../js/core/audit.js');
const { loadV03, lb } = require('./helpers.js');

test('監査ケース：想定どおり／誤発火候補／拾い漏れを判定する', () => {
  const book = lb([{ title: '緊迫', keywords: ['斬', '構え'] }]);
  const r = (c) => a.evaluateCase(c, book).status;
  assert.equal(r({ targetType: 'keyword', target: '急が', text: '急がないで', expect: 'match' }), 'pass');
  assert.equal(r({ targetType: 'keyword', target: '急が', text: '急ぐ', expect: 'match' }), 'missed');
  assert.equal(r({ targetType: 'keyword', target: '斬', text: '斬新', expect: 'nomatch' }), 'false-positive');
  assert.equal(r({ targetType: 'keyword', target: '欲しが', text: '欲しい', expect: 'nomatch' }), 'pass');
  assert.equal(r({ targetType: 'entry', target: '緊迫', text: '心構え', expect: 'nomatch' }), 'false-positive');
  assert.equal(r({ targetType: 'entry', target: '存在しない', text: 'x', expect: 'match' }), 'missing-entry');
});

test('監査ケース：項目は番号付きの名前でも探せる', () => {
  const v = loadV03();
  assert.equal(a.findEntry(v, '28｜緊迫と危機').title, '緊迫と危機');
  assert.equal(a.findEntry(v, '緊迫と危機').no, '28');
});

test('サンプルケースをv0.3で実行した結果', () => {
  const v = loadV03();
  const r = a.evaluateCases(a.sampleCases(), v);
  assert.deepEqual(r.summary, { pass: 4, 'false-positive': 6, missed: 5, 'missing-entry': 0 });
  const missed = r.results.filter((x) => x.result.status === 'missed').map((x) => x.case.text);
  assert.ok(missed.includes('彼はこちらと目を合わせようとしない。'));
  assert.ok(missed.includes('彼女はそれきり黙る。'));
});

test('静的点検：v0.3の1文字キーワードは12個', () => {
  const r = a.staticAudit(loadV03(), []);
  assert.deepEqual(r.singleChar.map((x) => x.keyword).join(''), '囁呟叫驚睨怖涙泣悩皆襲斬');
  assert.equal(r.overLimit.length, 0);
  assert.equal(r.dupAcross.length, 0);
  assert.equal(r.containment.length, 0);
});

test('静的点検：語彙リストで誤発火候補を見つける', () => {
  const r = a.staticAudit(loadV03(), ['斬新', '皆無', '心構え', 'ほっとけない', '無関係']);
  const pairs = r.vocabHits.map((v) => v.keyword + ':' + v.words.join('/'));
  assert.deepEqual(pairs.sort(), ['ほっと:ほっとけない', '構え:心構え', '斬:斬新', '皆:皆無'].sort());
});

test('静的点検：重複・包含・上限超過を見つける', () => {
  const book = lb([
    { title: 'A', keywords: ['涙', '涙ぐ', 'x', 'y', 'z', 'over'] },
    { title: 'B', keywords: ['涙'] }
  ]);
  const r = a.staticAudit(book, []);
  assert.equal(r.overLimit.length, 1);
  assert.deepEqual(r.overLimit[0].overflow, ['over']);
  assert.equal(r.dupAcross[0].keyword, '涙');
  const inner = r.containment.filter((c) => c.sameEntry);
  const outer = r.containment.filter((c) => !c.sameEntry);
  assert.equal(inner.length, 1);
  assert.equal(inner[0].long, '涙ぐ');
  assert.equal(outer.length, 1);
  assert.equal(outer[0].shortEntry.title, 'B');
});

test('静的点検：本文に含まれるキーワード（連鎖リスク）', () => {
  const v = loadV03();
  const r = a.staticAudit(v, []);
  const e09 = r.bodyChain.find((b) => b.entry.title === '不安と恐れ');
  assert.ok(e09.targets.some((t) => t.entry.title === '複数人物の会話' && t.keywords.includes('全員')));
});
