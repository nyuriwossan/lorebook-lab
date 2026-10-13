/*
 * Lorebook Lab — 文字列一致エンジン
 *
 * Zeta / Zetter の実機で確認された前提に合わせ、
 *   - 大文字小文字・全角半角・ひらがなカタカナを変換しない
 *   - 活用形を補完しない
 *   - 登録キーワードそのものとの部分一致で判定する
 * という「完全一致の部分文字列検索」を行う。
 *
 * 表記ゆれ（カナ・幅・大小）を畳んだ場合にだけ一致する箇所は、
 * nearMisses() で「拾い漏れの可能性」として別に報告する（判定には使わない）。
 *
 * ブラウザでは window.LL.matcher、Node では require() で使える。
 */
(function (global, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { global.LL = global.LL || {}; global.LL.matcher = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Zeta / Zetter のロアブック1項目あたりのキーワード上限 */
  var MAX_KEYWORDS = 5;

  /** 照合に使うキーワード（先頭5個・空文字と重複を除外） */
  function activeKeywords(entry) {
    var out = [];
    var list = (entry && entry.keywords) || [];
    for (var i = 0; i < list.length && i < MAX_KEYWORDS; i++) {
      var k = list[i];
      if (typeof k === 'string' && k.length > 0 && out.indexOf(k) === -1) out.push(k);
    }
    return out;
  }

  /** 上限を超えて照合対象外になるキーワード */
  function overflowKeywords(entry) {
    var list = (entry && entry.keywords) || [];
    return list.slice(MAX_KEYWORDS).filter(function (k) { return typeof k === 'string' && k.length > 0; });
  }

  /** text 中の keyword の出現位置をすべて返す（重なりも数える） */
  function findAll(text, keyword) {
    var out = [];
    if (!keyword || !text) return out;
    var i = text.indexOf(keyword);
    while (i !== -1) {
      out.push({ start: i, end: i + keyword.length });
      i = text.indexOf(keyword, i + 1);
    }
    return out;
  }

  /**
   * 入力文とロアブック項目を照合する。
   * @returns {{matched: Array, unmatched: Array, occurrences: Array, totalHits: number}}
   */
  function analyze(text, entries) {
    text = typeof text === 'string' ? text : '';
    entries = entries || [];
    var matched = [];
    var unmatched = [];
    var occurrences = [];
    entries.forEach(function (entry) {
      var hits = [];
      var total = 0;
      activeKeywords(entry).forEach(function (kw) {
        var pos = findAll(text, kw);
        if (pos.length) {
          hits.push({ keyword: kw, count: pos.length, positions: pos });
          total += pos.length;
          pos.forEach(function (p) {
            occurrences.push({ entryId: entry.id, keyword: kw, start: p.start, end: p.end });
          });
        }
      });
      if (hits.length) matched.push({ entry: entry, hits: hits, total: total });
      else unmatched.push(entry);
    });
    occurrences.sort(function (a, b) {
      return a.start - b.start || (b.end - b.start) - (a.end - a.start);
    });
    return { matched: matched, unmatched: unmatched, occurrences: occurrences, totalHits: occurrences.length };
  }

  /** 一致したロアブック項目IDの集合 */
  function matchedIds(text, entries) {
    return analyze(text, entries).matched.map(function (m) { return m.entry.id; });
  }

  /**
   * ハイライト描画用に、入力文を「重なり方が同じ区間」に分割する。
   * 各区間は自分を覆う一致（occ）の配列を持つ。
   */
  function segments(text, occurrences) {
    text = text || '';
    var cuts = [0, text.length];
    occurrences.forEach(function (o) { cuts.push(o.start, o.end); });
    cuts = cuts.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < cuts.length - 1; i++) {
      var a = cuts[i], b = cuts[i + 1];
      if (a >= b) continue;
      var occ = occurrences.filter(function (o) { return o.start <= a && o.end >= b; });
      out.push({ start: a, end: b, text: text.slice(a, b), occ: occ });
    }
    return out;
  }

  /** UTF-16 位置を「何文字目（1始まり・サロゲートペアを1文字と数える）」に変換 */
  function charNumber(text, index) {
    return Array.from(text.slice(0, index)).length + 1;
  }

  /** 一致箇所の前後を切り出す */
  function snippet(text, start, end, radius) {
    radius = radius == null ? 12 : radius;
    var s = Math.max(0, start - radius);
    var e = Math.min(text.length, end + radius);
    return {
      before: (s > 0 ? '…' : '') + text.slice(s, start).replace(/\s+/g, ' '),
      hit: text.slice(start, end),
      after: text.slice(end, e).replace(/\s+/g, ' ') + (e < text.length ? '…' : '')
    };
  }

  /* ---------- 表記ゆれ（判定には使わない・参考表示用） ---------- */

  var FOLD_MODES = [
    { key: 'kana', label: 'ひらがな／カタカナ' },
    { key: 'width', label: '全角／半角' },
    { key: 'case', label: '大文字／小文字' }
  ];

  function foldChar(ch, mode) {
    var c = ch;
    if (mode.width) c = c.normalize('NFKC');
    if (mode.case) c = c.toLowerCase();
    if (mode.kana) {
      c = c.replace(/[ァ-ヶ]/g, function (m) {
        return String.fromCharCode(m.charCodeAt(0) - 0x60);
      });
    }
    return c;
  }

  /** 文字ごとに畳み込み、畳んだ文字列の位置 → 元の位置 の対応表を作る */
  function foldWithMap(text, mode) {
    var out = '';
    var map = [];
    var i = 0;
    for (var it = text[Symbol.iterator](), step = it.next(); !step.done; step = it.next()) {
      var ch = step.value;
      var f = foldChar(ch, mode);
      for (var k = 0; k < f.length; k++) map.push(i);
      out += f;
      i += ch.length;
    }
    map.push(i);
    return { text: out, map: map };
  }

  function fold(text, mode) { return foldWithMap(text, mode).text; }

  /** どの表記ゆれが原因で一致しなかったか */
  function foldReasons(keyword, found) {
    var all = { kana: true, width: true, case: true };
    var reasons = [];
    FOLD_MODES.forEach(function (m) {
      var without = Object.assign({}, all);
      without[m.key] = false;
      if (fold(keyword, without) !== fold(found, without)) reasons.push(m.label);
    });
    return reasons.length ? reasons : ['表記ゆれ'];
  }

  /**
   * 表記ゆれを畳めば一致するが、実際の文字列としては一致していない箇所。
   * 実機では変換されないため「拾い漏れの可能性」として扱う。
   */
  function nearMisses(text, entries) {
    text = text || '';
    var all = { kana: true, width: true, case: true };
    var folded = foldWithMap(text, all);
    var out = [];
    (entries || []).forEach(function (entry) {
      // 同じ項目の別キーワードで既に一致している箇所は報告しない
      var exact = [];
      activeKeywords(entry).forEach(function (kw) { exact = exact.concat(findAll(text, kw)); });
      activeKeywords(entry).forEach(function (kw) {
        var fkw = fold(kw, all);
        if (!fkw) return;
        findAll(folded.text, fkw).forEach(function (p) {
          var s = folded.map[p.start];
          var e = folded.map[p.end];
          if (e <= s) return;
          var overlapsExact = exact.some(function (x) { return x.start < e && x.end > s; });
          if (overlapsExact) return;
          var found = text.slice(s, e);
          var dup = out.some(function (o) { return o.entryId === entry.id && o.start === s && o.end === e; });
          if (dup) return;
          out.push({ entryId: entry.id, keyword: kw, found: found, start: s, end: e, reasons: foldReasons(kw, found) });
        });
      });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  return {
    MAX_KEYWORDS: MAX_KEYWORDS,
    activeKeywords: activeKeywords,
    overflowKeywords: overflowKeywords,
    findAll: findAll,
    analyze: analyze,
    matchedIds: matchedIds,
    segments: segments,
    charNumber: charNumber,
    snippet: snippet,
    fold: fold,
    nearMisses: nearMisses
  };
});
