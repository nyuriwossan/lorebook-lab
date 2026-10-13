/*
 * Lorebook Lab — 複数ターンの連動分析
 *
 * 前提（利用者の実機検証による）:
 *   ある発言でキーワードが一致すると、その次のAI生成1回にだけ影響する。
 *
 * したがって AI の各生成に影響しうる候補は、
 *   「前回のAI生成」と「その後のユーザー発言」で一致した項目の和集合 になる。
 * AI生成文で一致した項目は、次のAI生成への候補として表示する。
 * いずれも文字列一致からの推定で、実機で発火したことを示すものではない。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./matcher.js'));
  else { global.LL = global.LL || {}; global.LL.chain = factory(global.LL.matcher); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (matcher) {
  'use strict';

  /**
   * @param turns [{ role: 'user' | 'ai', text }]
   * @param entries ロアブック項目
   * @returns {{ rows, pending, summary }}
   */
  function analyzeTurns(turns, entries) {
    var rows = (turns || []).map(function (t, i) {
      return { index: i, role: t.role === 'ai' ? 'ai' : 'user', text: t.text || '', result: matcher.analyze(t.text || '', entries), influences: [] };
    });

    var buffer = {};          // entryId -> influence（次のAI生成へ持ち越す）
    var order = [];
    var prevAiInfluence = {}; // entryId -> streak
    var streakMax = {};

    function push(row) {
      row.result.matched.forEach(function (m) {
        var id = m.entry.id;
        if (!buffer[id]) {
          buffer[id] = { entry: m.entry, sources: [] };
          order.push(id);
        }
        buffer[id].sources.push({ index: row.index, role: row.role, keywords: m.hits.map(function (h) { return h.keyword; }) });
      });
    }

    rows.forEach(function (row) {
      if (row.role === 'ai') {
        var current = {};
        row.influences = order.map(function (id) {
          var inf = buffer[id];
          var roles = inf.sources.map(function (s) { return s.role; });
          var streak = (prevAiInfluence[id] || 0) + 1;
          current[id] = streak;
          streakMax[id] = Math.max(streakMax[id] || 0, streak);
          return {
            entry: inf.entry,
            sources: inf.sources,
            fromAiOnly: roles.indexOf('user') === -1,
            streak: streak,
            // この生成の文中にも同じ項目のキーワードがある → 次も候補に残る
            reappears: row.result.matched.some(function (m) { return m.entry.id === id; })
          };
        });
        prevAiInfluence = current;
        buffer = {};
        order = [];
      }
      push(row);
    });

    var pending = order.map(function (id) {
      return { entry: buffer[id].entry, sources: buffer[id].sources, fromAiOnly: buffer[id].sources.every(function (s) { return s.role === 'ai'; }) };
    });

    var loops = Object.keys(streakMax).filter(function (id) { return streakMax[id] >= 3; });
    return {
      rows: rows,
      pending: pending,
      summary: {
        turns: rows.length,
        aiTurns: rows.filter(function (r) { return r.role === 'ai'; }).length,
        longStreakEntryIds: loops
      }
    };
  }

  /** 連動分析の例 */
  function sampleTurns() {
    return [
      { role: 'user', text: '久しぶり。……元気だった？' },
      { role: 'ai', text: '彼女は一瞬だけ目を見開き、それから小さく微笑んだ。「久しぶりね。急に来るから驚いたわ」' },
      { role: 'user', text: 'ごめん、連絡できなくて。ずっと会いたかった。' },
      { role: 'ai', text: '彼女は黙ったまま視線を落とし、指先でカップの縁をなぞった。やがて、ほっとしたように息をつく。' },
      { role: 'user', text: '隣に座ってもいい？' },
      { role: 'ai', text: '「どうぞ」と彼女は少し横にずれた。窓の外で雨音が強くなる。彼女はもう一度、小さく微笑んだ。' }
    ];
  }

  return { analyzeTurns: analyzeTurns, sampleTurns: sampleTurns };
});
