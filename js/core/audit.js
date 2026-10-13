/*
 * Lorebook Lab — 誤発火・拾い漏れの監査
 *
 *  evaluateCase / evaluateCases : 「この文で一致すべきか」を登録した監査ケースの判定
 *  staticAudit                  : キーワード設計そのものの点検（上限・重複・包含・1文字・語彙・本文連鎖）
 *
 * いずれも文字列一致の結果であり、意味的に適切かどうかは利用者が判断する。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./matcher.js'));
  else { global.LL = global.LL || {}; global.LL.audit = factory(global.LL.matcher); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (matcher) {
  'use strict';

  var STATUS = {
    pass: '想定どおり',
    'false-positive': '誤発火候補',
    missed: '拾い漏れ',
    'missing-entry': '項目が見つからない'
  };

  function titleKey(s) {
    return String(s || '').replace(/\s+/g, '').replace(/^\d{1,3}[｜|:：.．、]/, '');
  }

  function findEntry(lorebook, target) {
    if (!lorebook) return null;
    var key = titleKey(target);
    var list = lorebook.entries || [];
    for (var i = 0; i < list.length; i++) {
      if (titleKey(list[i].title) === key || list[i].id === target) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].no && String(list[j].no) === String(target).trim()) return list[j];
    }
    return null;
  }

  /**
   * 監査ケース
   *   { text, targetType: 'keyword' | 'entry', target, expect: 'match' | 'nomatch', memo }
   */
  function evaluateCase(c, lorebook) {
    var text = c.text || '';
    var hits = [];
    var actual = false;
    var entry = null;
    if (c.targetType === 'entry') {
      entry = findEntry(lorebook, c.target);
      if (!entry) return { status: 'missing-entry', label: STATUS['missing-entry'], actual: null, hits: [], entry: null };
      var r = matcher.analyze(text, [entry]);
      hits = r.occurrences;
      actual = r.matched.length > 0;
    } else {
      hits = matcher.findAll(text, c.target).map(function (p) {
        return { keyword: c.target, start: p.start, end: p.end };
      });
      actual = hits.length > 0;
    }
    var expectMatch = c.expect !== 'nomatch';
    var status = actual === expectMatch ? 'pass' : (actual ? 'false-positive' : 'missed');
    return { status: status, label: STATUS[status], actual: actual, hits: hits, entry: entry };
  }

  function evaluateCases(cases, lorebook) {
    var summary = { pass: 0, 'false-positive': 0, missed: 0, 'missing-entry': 0 };
    var results = (cases || []).map(function (c) {
      var r = evaluateCase(c, lorebook);
      summary[r.status] += 1;
      return { case: c, result: r };
    });
    return { results: results, summary: summary };
  }

  /** 初期の監査ケース。expect は「設計者として一致してほしいか」 */
  function sampleCases() {
    var K = 'keyword', E = 'entry';
    return [
      { targetType: K, target: '急が', text: '急がないで、ゆっくりでいい。', expect: 'match', memo: '否定形は拾える' },
      { targetType: K, target: '急が', text: '急がずに歩いた。', expect: 'match', memo: '' },
      { targetType: K, target: '急が', text: '急ぐ必要はない。', expect: 'match', memo: '「急が」では終止形「急ぐ」を拾えない' },
      { targetType: K, target: 'かわい', text: 'かわいそうに、と呟いた。', expect: 'nomatch', memo: '「かわいそう」は意味が違う' },
      { targetType: K, target: '可愛', text: '猫を可愛がる。', expect: 'match', memo: '' },
      { targetType: K, target: '斬', text: '斬新なアイデアだ。', expect: 'nomatch', memo: '1文字キーワードの誤発火' },
      { targetType: K, target: '欲しが', text: 'それが欲しい。', expect: 'match', memo: '「欲しが」では「欲しい」を拾えない' },
      { targetType: E, target: '声の変化', text: 'ささやかな贈り物を渡した。', expect: 'nomatch', memo: 'v0.3注記：ささや→ささやか' },
      { targetType: E, target: '緊迫と危機', text: '世襲制の国だった。', expect: 'nomatch', memo: 'v0.3注記：襲→世襲' },
      { targetType: E, target: '複数人物の会話', text: '可能性は皆無だった。', expect: 'nomatch', memo: 'v0.3注記：皆→皆無' },
      { targetType: E, target: '緊迫と危機', text: '試合前の心構えを話した。', expect: 'nomatch', memo: 'v0.3注記：構え→心構え' },
      { targetType: E, target: '視線の使い方', text: '彼はこちらと目を合わせようとしない。', expect: 'match', memo: '「目が合」では「目を合わせ」を拾えない' },
      { targetType: E, target: '沈黙と間', text: '彼女はそれきり黙る。', expect: 'match', memo: '「黙っ」「黙り」では終止形「黙る」を拾えない' },
      { targetType: E, target: '表情の細部', text: 'ふっとほほえんだ。', expect: 'match', memo: 'ひらがな表記の「ほほえ」は拾えない' },
      { targetType: E, target: '安堵と喜び', text: 'ホッとして肩の力が抜けた。', expect: 'match', memo: 'カタカナ版を登録済み' }
    ];
  }

  /** 誤発火チェック用の語彙（日常語に含まれてしまう例）。利用者が編集できる */
  function defaultVocab() {
    return [
      '斬新', '斬首', '世襲', '踏襲', '襲名', '皆無', '皆勤', '皆様', '皆目', '皆既日食',
      '心構え', '身構え', '気構え', '店構え', '中段の構え', 'ささやか',
      '無事故', '高姿勢', '前向きな姿勢', '撫で肩', '怒り肩', '惚れ惚れ',
      '離れた場所', '離れた町', '隣に住む', '涙ぐましい', '涙腺', '泣き所', '悩ましい',
      '驚異', '驚異的', '冷え性', 'ほっとけない', 'ごめんください', '恥ずかしながら',
      '電話番号', 'ノックアウト', '料理人', '食事制限', '香り高い', '到着予定',
      '逃げ道', '逃げ場', '危ない橋', '決断力', '安心安全', '冗談抜き', '皮肉屋',
      '一同起立', 'みんなの', '全員参加', '無言電話', 'さよならホームラン', '久しぶりの雨'
    ];
  }

  function label(e) {
    return (e.no ? e.no + '｜' : '') + (e.title || '（無題）');
  }

  /**
   * キーワード設計の静的点検。
   * @param lorebook
   * @param vocab 誤発火チェック用の語彙配列
   */
  function staticAudit(lorebook, vocab) {
    var entries = (lorebook && lorebook.entries) || [];
    var out = {
      overLimit: [], empty: [], dupWithin: [], dupAcross: [],
      containment: [], singleChar: [], vocabHits: [], bodyChain: []
    };

    var byKeyword = {};
    var flat = [];
    entries.forEach(function (e) {
      var kws = e.keywords || [];
      if (kws.filter(Boolean).length === 0) out.empty.push({ entry: e });
      if (kws.length > matcher.MAX_KEYWORDS) out.overLimit.push({ entry: e, overflow: matcher.overflowKeywords(e) });
      var seen = {};
      kws.forEach(function (k) {
        if (k && seen[k]) out.dupWithin.push({ entry: e, keyword: k });
        seen[k] = true;
      });
      matcher.activeKeywords(e).forEach(function (k) {
        (byKeyword[k] = byKeyword[k] || []).push(e);
        flat.push({ keyword: k, entry: e });
        if (Array.from(k).length === 1) out.singleChar.push({ keyword: k, entry: e });
      });
    });

    Object.keys(byKeyword).forEach(function (k) {
      if (byKeyword[k].length > 1) out.dupAcross.push({ keyword: k, entries: byKeyword[k] });
    });

    // 包含：短い語 a が長い語 b に含まれる → b が出れば a の項目も必ず一致する
    flat.forEach(function (a) {
      flat.forEach(function (b) {
        if (a === b || a.keyword === b.keyword) return;
        if (b.keyword.indexOf(a.keyword) !== -1) {
          out.containment.push({
            short: a.keyword, shortEntry: a.entry,
            long: b.keyword, longEntry: b.entry,
            sameEntry: a.entry.id === b.entry.id
          });
        }
      });
    });

    // 語彙チェック：日常語に一致してしまうキーワード
    var vocabMap = {};
    (vocab || []).forEach(function (word) {
      word = String(word || '').trim();
      if (!word) return;
      matcher.analyze(word, entries).matched.forEach(function (m) {
        m.hits.forEach(function (h) {
          var key = m.entry.id + '\u0000' + h.keyword;
          if (!vocabMap[key]) {
            vocabMap[key] = { entry: m.entry, keyword: h.keyword, words: [] };
            out.vocabHits.push(vocabMap[key]);
          }
          if (vocabMap[key].words.indexOf(word) === -1) vocabMap[key].words.push(word);
        });
      });
    });

    // 本文の連鎖リスク：登録本文にキーワードが含まれる（AIが本文の語を書くと再一致しやすい）
    entries.forEach(function (e) {
      var r = matcher.analyze(e.body || '', entries);
      if (!r.matched.length) return;
      out.bodyChain.push({
        entry: e,
        targets: r.matched.map(function (m) {
          return { entry: m.entry, keywords: m.hits.map(function (h) { return h.keyword; }), self: m.entry.id === e.id };
        })
      });
    });

    return out;
  }

  return {
    STATUS: STATUS,
    findEntry: findEntry,
    evaluateCase: evaluateCase,
    evaluateCases: evaluateCases,
    sampleCases: sampleCases,
    defaultVocab: defaultVocab,
    staticAudit: staticAudit,
    label: label
  };
});
