'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../js/core/matcher.js');
const { loadV03, lb } = require('./helpers.js');
const ents = (arr) => lb(arr).entries;

const hit = (text, kw) => m.findAll(text, kw).length > 0;

test('仕様の例：活用形は補完しない（部分一致のみ）', () => {
  assert.equal(hit('急がないで', '急が'), true);
  assert.equal(hit('急がずに', '急が'), true);
  assert.equal(hit('急ぐ必要はない', '急が'), false);
  assert.equal(hit('かわいそうに', 'かわい'), true);
  assert.equal(hit('猫を可愛がる', '可愛'), true);
  assert.equal(hit('斬新なアイデア', '斬'), true);
  assert.equal(hit('それが欲しい', '欲しが'), false);
});

test('表記を変換しない：ひらがな／カタカナ・全角／半角・大文字／小文字', () => {
  assert.equal(hit('ホッとした', 'ほっと'), false);
  assert.equal(hit('ほっとした', 'ホッと'), false);
  assert.equal(hit('ほほえんだ', '微笑'), false);
  assert.equal(hit('ＫＩＳＳ', 'KISS'), false);
  assert.equal(hit('kiss', 'KISS'), false);
  assert.equal(hit('ｷｽ', 'キス'), false);
});

test('漢字1文字のキーワードに対応する', () => {
  const r = m.analyze('彼は叫んだ。皆が振り向く。', ents([{ keywords: ['叫'] }, { keywords: ['皆'] }, { keywords: ['涙'] }]));
  assert.deepEqual(r.matched.map((x) => x.entry.id), ['e0', 'e1']);
  assert.deepEqual(r.unmatched.map((x) => x.id), ['e2']);
});

test('出現位置と回数を返す', () => {
  const text = '微笑んで、また微笑む。';
  const r = m.analyze(text, ents([{ keywords: ['微笑'] }]));
  const h = r.matched[0].hits[0];
  assert.equal(h.count, 2);
  assert.deepEqual(h.positions, [{ start: 0, end: 2 }, { start: 7, end: 9 }]);
  assert.equal(m.charNumber(text, 7), 8);
});

test('重なった出現も数える', () => {
  assert.equal(m.findAll('ささささ', 'ささ').length, 3);
});

test('6個目以降のキーワードは照合に使わない', () => {
  const e = { id: 'x', keywords: ['a', 'b', 'c', 'd', 'e', 'f'] };
  assert.deepEqual(m.activeKeywords(e), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(m.overflowKeywords(e), ['f']);
  assert.equal(m.analyze('f', ents([e])).matched.length, 0);
});

test('空文字キーワードと重複は無視する', () => {
  assert.deepEqual(m.activeKeywords({ keywords: ['', '涙', '涙'] }), ['涙']);
  assert.equal(m.analyze('', ents([{ keywords: [''] }])).matched.length, 0);
});

test('サロゲートペアを含む文でも位置がずれない', () => {
  const text = '𠮷野で泣いた';
  const r = m.analyze(text, ents([{ keywords: ['泣'] }]));
  const p = r.occurrences[0];
  assert.equal(text.slice(p.start, p.end), '泣');
  assert.equal(m.charNumber(text, p.start), 4);
});

test('ハイライト用の区間分割：重なりを正しく扱う', () => {
  const text = 'abcde';
  const occ = [{ start: 1, end: 4, entryId: 'A' }, { start: 2, end: 3, entryId: 'B' }];
  const seg = m.segments(text, occ);
  assert.deepEqual(seg.map((s) => s.text), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(seg.map((s) => s.occ.length), [0, 1, 2, 1, 0]);
  assert.equal(seg.map((s) => s.text).join(''), text);
});

test('表記ゆれによる拾い漏れの可能性を報告する（判定には使わない）', () => {
  const book = ents([{ keywords: ['ほっと'] }, { keywords: ['KISS'] }]);
  const r = m.analyze('ホッとした。ｋｉｓｓ', book);
  assert.equal(r.matched.length, 0);
  const near = m.nearMisses('ホッとした。ｋｉｓｓ', book);
  assert.equal(near.length, 2);
  assert.equal(near[0].found, 'ホッと');
  assert.deepEqual(near[0].reasons, ['ひらがな／カタカナ']);
  assert.equal(near[1].found, 'ｋｉｓｓ');
  assert.deepEqual(near[1].reasons, ['全角／半角', '大文字／小文字']);
});

test('完全一致している箇所は表記ゆれ候補に出さない', () => {
  const book = ents([{ keywords: ['ほっと', 'ホッと'] }]);
  assert.equal(m.nearMisses('ホッとした', book).length, 0);
});

test('v0.3：誤発火候補として注記された語に実際に一致する', () => {
  const v = loadV03();
  const ids = (t) => m.analyze(t, v.entries).matched.map((x) => x.entry.title);
  assert.ok(ids('ささやかな贈り物').includes('声の変化'));
  assert.ok(ids('世襲制').includes('緊迫と危機'));
  assert.ok(ids('斬新だ').includes('緊迫と危機'));
  assert.ok(ids('皆無だ').includes('複数人物の会話'));
  assert.ok(ids('心構え').includes('緊迫と危機'));
});

test('v0.3：会話例で想定どおりの項目が一致する', () => {
  const v = loadV03();
  const text = '久しぶり。……ごめん、急に来て。本当は、ずっと会いたかったんだ。';
  const titles = m.analyze(text, v.entries).matched.map((x) => x.entry.title);
  assert.deepEqual(titles.sort(), ['別れと再会', '言外の感情と駆け引き', '謝罪とすれ違い'].sort());
});
