/*
 * Lorebook Lab — バージョン比較
 *
 * 旧版・新版の項目を「項目名」で対応づけ（名前が変わった場合は番号で補う）、
 * 同じ入力文での一致結果の差と、キーワードの増減を出す。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./matcher.js'));
  else { global.LL = global.LL || {}; global.LL.compare = factory(global.LL.matcher); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (matcher) {
  'use strict';

  function key(e) { return String(e.title || '').replace(/\s+/g, ''); }

  /** 旧版・新版の項目を対応づける */
  function pairEntries(oldLb, newLb) {
    var olds = (oldLb && oldLb.entries) || [];
    var news = (newLb && newLb.entries) || [];
    var usedNew = {};
    var pairs = [];
    olds.forEach(function (o) {
      var n = null;
      for (var i = 0; i < news.length; i++) {
        if (!usedNew[news[i].id] && key(news[i]) && key(news[i]) === key(o)) { n = news[i]; break; }
      }
      pairs.push({ old: o, new: n });
      if (n) usedNew[n.id] = true;
    });
    // 名前で対応しなかったものは番号で対応づける（項目名だけ変えた場合）
    pairs.forEach(function (p) {
      if (p.new || !p.old.no) return;
      for (var i = 0; i < news.length; i++) {
        if (!usedNew[news[i].id] && news[i].no && news[i].no === p.old.no) {
          p.new = news[i]; usedNew[news[i].id] = true; p.renamed = true; break;
        }
      }
    });
    news.forEach(function (n) { if (!usedNew[n.id]) pairs.push({ old: null, new: n }); });
    pairs.forEach(function (p) {
      var ok = p.old ? matcher.activeKeywords(p.old) : [];
      var nk = p.new ? matcher.activeKeywords(p.new) : [];
      p.added = nk.filter(function (k) { return ok.indexOf(k) === -1; });
      p.removed = ok.filter(function (k) { return nk.indexOf(k) === -1; });
      p.bodyChanged = !!(p.old && p.new && (p.old.body || '') !== (p.new.body || ''));
    });
    return pairs;
  }

  /** キーワードや本文に変化がある対応だけ */
  function keywordDiff(oldLb, newLb) {
    return pairEntries(oldLb, newLb).filter(function (p) {
      return !p.old || !p.new || p.added.length || p.removed.length || p.bodyChanged || p.renamed;
    });
  }

  /**
   * 同じ入力文で旧版と新版を照合して比べる。
   * lostByKeywordChange : 旧版で一致した語が新版で消えたため一致しなくなった項目
   */
  function compareText(text, oldLb, newLb) {
    var ra = matcher.analyze(text, (oldLb && oldLb.entries) || []);
    var rb = matcher.analyze(text, (newLb && newLb.entries) || []);
    var hitA = {}, hitB = {};
    ra.matched.forEach(function (m) { hitA[m.entry.id] = m; });
    rb.matched.forEach(function (m) { hitB[m.entry.id] = m; });

    var out = { both: [], oldOnly: [], newOnly: [], lostByKeywordChange: [], removedEntries: [], oldResult: ra, newResult: rb };
    pairEntries(oldLb, newLb).forEach(function (p) {
      var a = p.old ? hitA[p.old.id] : null;
      var b = p.new ? hitB[p.new.id] : null;
      if (a && b) out.both.push({ pair: p, old: a, new: b });
      else if (a) {
        out.oldOnly.push({ pair: p, old: a });
        if (p.new) {
          var lost = a.hits.map(function (h) { return h.keyword; }).filter(function (k) { return p.removed.indexOf(k) !== -1; });
          out.lostByKeywordChange.push({ pair: p, old: a, lostKeywords: lost });
        } else {
          out.removedEntries.push({ pair: p, old: a });
        }
      } else if (b) out.newOnly.push({ pair: p, new: b });
    });
    return out;
  }

  return { pairEntries: pairEntries, keywordDiff: keywordDiff, compareText: compareText };
});
