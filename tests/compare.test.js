'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../js/core/compare.js');
const { loadV03 } = require('./helpers.js');

function cloneWith(lb, edit) {
  const copy = JSON.parse(JSON.stringify(lb));
  copy.id = 'new';
  copy.version = 'v0.4';
  copy.entries.forEach((e) => { e.id = 'n_' + e.id; });
  edit(copy);
  return copy;
}

test('同じ版どうしは全部「両方で一致」', () => {
  const v = loadV03();
  const r = c.compareText('久しぶり、ごめん。', v, cloneWith(v, () => {}));
  assert.equal(r.oldOnly.length, 0);
  assert.equal(r.newOnly.length, 0);
  assert.equal(r.both.length, 2);
});

test('キーワード変更による拾い漏れを検出する', () => {
  const v = loadV03();
  const nv = cloneWith(v, (b) => {
    const e = b.entries.find((x) => x.title === '緊迫と危機');
    e.keywords = ['危ない', '逃げ', '襲いか', '斬りかか', '身構え'];
  });
  const r = c.compareText('男は斬りつけてきた。', v, nv);
  assert.equal(r.oldOnly.length, 1);
  assert.equal(r.lostByKeywordChange.length, 1);
  assert.deepEqual(r.lostByKeywordChange[0].lostKeywords, ['斬']);
  // 誤発火は解消
  const r2 = c.compareText('斬新な案だ。', v, nv);
  assert.equal(r2.oldOnly.length, 1);
  assert.equal(r2.newOnly.length, 0);
});

test('新版だけで一致・新規項目・削除項目', () => {
  const v = loadV03();
  const nv = cloneWith(v, (b) => {
    b.entries.find((x) => x.title === '視線の使い方').keywords.push('目を合わせ');
    b.entries.find((x) => x.title === '視線の使い方').keywords.splice(4, 1);
    b.entries = b.entries.filter((x) => x.title !== '冗談と軽口');
    b.entries.push({ id: 'n_new', no: '30', title: '罪悪感', keywords: ['後ろめた'], body: '' });
  });
  const r = c.compareText('目を合わせられず、後ろめたい。冗談だよ。', v, nv);
  assert.deepEqual(r.newOnly.map((x) => x.pair.new.title).sort(), ['罪悪感', '視線の使い方'].sort());
  assert.deepEqual(r.removedEntries.map((x) => x.pair.old.title), ['冗談と軽口']);
  const diff = c.keywordDiff(v, nv);
  const gaze = diff.find((p) => p.old && p.old.title === '視線の使い方');
  assert.deepEqual(gaze.added, ['目を合わせ']);
  assert.deepEqual(gaze.removed, ['目をそら']);
});

test('項目名が変わっても番号で対応づける', () => {
  const v = loadV03();
  const nv = cloneWith(v, (b) => { b.entries[0].title = '表情の細部（改）'; });
  const pairs = c.pairEntries(v, nv);
  const p = pairs.find((x) => x.old && x.old.no === '01');
  assert.equal(p.new.title, '表情の細部（改）');
  assert.equal(p.renamed, true);
});
