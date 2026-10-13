/*
 * Lorebook Lab — ロアブック Markdown / JSON の読み込みと書き出し
 *
 * 想定する Markdown（v0.3 と同じ形）:
 *
 *   # ロアブック名 v0.3
 *   ## 分類名
 *   ### 01｜項目名
 *   **キーワード：** 語1、語2、語3
 *   **本文：** 登録本文
 *
 * AI が少し崩した形（コードブロック囲み、「- キーワード: 」、半角コロン、
 * キーワードの箇条書き、「」付きなど）も受け付ける。
 */
(function (global, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { global.LL = global.LL || {}; global.LL.parser = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_KEYWORDS = 5;

  var RE_FENCE = /^\s*(```|~~~)/;
  var RE_H1 = /^#\s+(.+?)\s*#*\s*$/;
  var RE_H2 = /^##\s+(.+?)\s*#*\s*$/;
  var RE_ENTRY = /^#{3,4}\s+(.+?)\s*#*\s*$/;
  var RE_RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
  var LABEL = '\\s*(?:[-*・]\\s*)?(?:\\*\\*|__)?\\s*';
  var AFTER = '\\s*(?:\\*\\*|__)?\\s*[：:]\\s*(?:\\*\\*|__)?\\s*(.*)$';
  var RE_KW = new RegExp('^' + LABEL + '(キーワード|keywords?|KW)' + AFTER, 'i');
  var RE_BODY = new RegExp('^' + LABEL + '(本文|登録本文|内容|説明|body|content|description)' + AFTER, 'i');
  var RE_OTHER_FIELD = /^\s*(?:[-*・]\s*)?(?:\*\*|__)([^\s：:*_]{1,12})(?:\*\*|__)?\s*[：:]/;
  var RE_LIST_ITEM = /^\s*(?:[-*・]|\d+[.)．])\s+(.+)$/;
  var RE_VERSION = /(?:^|[\s（(【\[_\-])(v(?:er\.?)?\s?\d+(?:\.\d+)*)/i;

  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** 「、」「,」「/」などで区切り、引用符や括弧を外す */
  function splitKeywords(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/[、,，;；\/／|｜\t]+/)
      .map(cleanKeyword)
      .filter(function (k) { return k.length > 0; });
  }

  function cleanKeyword(k) {
    var s = String(k).trim();
    s = s.replace(/^\*\*|\*\*$/g, '').trim();
    s = s.replace(/^[「『"'`“”‘’]+|[」』"'`“”‘’]+$/g, '').trim();
    return s;
  }

  /** "01｜表情の細部" → { no: "01", title: "表情の細部" } */
  function splitHeading(text) {
    var t = text.replace(/\*\*/g, '').trim();
    var m = t.match(/^([A-Za-zＡ-Ｚ]{0,3}\d{1,3})\s*[｜|:：.．、)\]）】\s]\s*(.+)$/);
    if (m) return { no: m[1], title: m[2].trim() };
    return { no: '', title: t };
  }

  function splitTitle(h1) {
    var t = h1.replace(/\*\*/g, '').trim();
    var m = t.match(RE_VERSION);
    var version = '';
    var name = t;
    if (m) {
      version = m[1].replace(/^ver\.?\s?/i, 'v').replace(/\s/g, '');
      name = (t.slice(0, m.index + m[0].indexOf(m[1])) + t.slice(m.index + m[0].length))
        .replace(/\s{2,}/g, ' ').replace(/\s+([（(【\[])/g, '$1').trim();
    }
    return { name: name, version: version };
  }

  /** 中身のない見出し（項目だけを含んでいた分類見出しなど）をメモから外す */
  function dropEmptySections(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var isHead = RE_H2.test(l) || RE_RULE.test(l);
      if (isHead) {
        var j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        var nextIsHeadOrEnd = j >= lines.length || RE_H2.test(lines[j]) || RE_RULE.test(lines[j]);
        if (nextIsHeadOrEnd) { i = j - 1; continue; }
      }
      out.push(l);
    }
    return out;
  }

  function trimLines(lines) {
    var a = lines.slice();
    while (a.length && !a[0].trim()) a.shift();
    while (a.length && !a[a.length - 1].trim()) a.pop();
    return a.join('\n').trim();
  }

  /**
   * Markdown テキストを解析する。
   * @returns {{name, version, entries, notes, warnings}}
   */
  function parseMarkdown(md, options) {
    options = options || {};
    var text = String(md || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    var lines = text.split('\n');

    var result = { name: '', version: '', entries: [], notes: '', warnings: [] };
    var noteLines = [];
    var category = '';
    var cur = null;          // 解析中の項目
    var field = null;        // 'kw' | 'body' | null

    function flush() {
      if (!cur) return;
      cur.body = trimLines(cur._body);
      delete cur._body;
      result.entries.push(cur);
      cur = null;
      field = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (RE_FENCE.test(line)) continue;           // ```markdown などの囲みは無視

      var m;
      if (!cur && !result.name && (m = line.match(RE_H1))) {
        var t = splitTitle(m[1]);
        result.name = t.name;
        result.version = t.version;
        continue;
      }
      if ((m = line.match(RE_ENTRY))) {
        flush();
        var h = splitHeading(m[1]);
        cur = { id: uid('e'), no: h.no, title: h.title, category: category, keywords: [], body: '', _body: [] };
        field = null;
        continue;
      }
      if ((m = line.match(RE_H2))) {
        flush();
        category = m[1].replace(/\*\*/g, '').trim();
        noteLines.push(line);
        continue;
      }
      if (RE_RULE.test(line)) {
        flush();
        category = '';
        noteLines.push(line);
        continue;
      }
      if (!cur) {
        noteLines.push(line);
        continue;
      }

      if ((m = line.match(RE_KW))) {
        field = 'kw';
        cur.keywords = cur.keywords.concat(splitKeywords(m[2]));
        continue;
      }
      if ((m = line.match(RE_BODY))) {
        field = 'body';
        if (m[2].trim()) cur._body.push(m[2]);
        continue;
      }
      if (RE_OTHER_FIELD.test(line)) {
        field = null;  // 知らない項目（例: **備考：**）は本文に混ぜない
        continue;
      }
      if (field === 'kw') {
        var li = line.match(RE_LIST_ITEM);
        if (li) { cur.keywords = cur.keywords.concat(splitKeywords(li[1])); continue; }
        if (!line.trim()) continue;
        cur.keywords = cur.keywords.concat(splitKeywords(line));
        continue;
      }
      if (field === 'body') {
        cur._body.push(line);
        continue;
      }
    }
    flush();

    if (!result.name) result.name = options.fallbackName || '読み込んだロアブック';
    result.notes = trimLines(dropEmptySections(noteLines));
    result.warnings = validate(result.entries);
    return result;
  }

  /** 項目ごとの注意点（上限超過・空・重複） */
  function validate(entries) {
    var warnings = [];
    (entries || []).forEach(function (e) {
      var label = (e.no ? e.no + '｜' : '') + (e.title || '（無題）');
      var kws = e.keywords || [];
      if (kws.length === 0) warnings.push({ entryId: e.id, level: 'error', message: label + '：キーワードがありません' });
      if (kws.length > MAX_KEYWORDS) {
        warnings.push({ entryId: e.id, level: 'error', message: label + '：キーワードが' + kws.length + '個あります（6個目以降「' + kws.slice(MAX_KEYWORDS).join('、') + '」は照合に使いません）' });
      }
      var seen = {};
      kws.forEach(function (k) {
        if (seen[k]) warnings.push({ entryId: e.id, level: 'warn', message: label + '：キーワード「' + k + '」が重複しています' });
        seen[k] = true;
      });
      if (!e.body || !String(e.body).trim()) warnings.push({ entryId: e.id, level: 'warn', message: label + '：本文が空です' });
    });
    return warnings;
  }

  /** 解析結果からロアブックオブジェクトを作る */
  function toLorebook(parsed, extra) {
    extra = extra || {};
    var now = new Date().toISOString();
    return {
      id: uid('lb'),
      name: extra.name || parsed.name,
      version: extra.version != null ? extra.version : parsed.version,
      notes: parsed.notes || '',
      entries: parsed.entries.map(function (e) {
        return { id: e.id || uid('e'), no: e.no || '', title: e.title || '', category: e.category || '', keywords: (e.keywords || []).slice(), body: e.body || '' };
      }),
      createdAt: now,
      updatedAt: now
    };
  }

  /** ロアブックを読み込み可能な Markdown に書き出す */
  function toMarkdown(lb) {
    var out = [];
    out.push('# ' + [lb.name, lb.version].filter(Boolean).join(' '));
    out.push('');
    var lastCat = null;
    (lb.entries || []).forEach(function (e) {
      if ((e.category || '') !== lastCat) {
        lastCat = e.category || '';
        if (lastCat) { out.push('## ' + lastCat); out.push(''); }
      }
      out.push('### ' + (e.no ? e.no + '｜' : '') + (e.title || '（無題）'));
      out.push('');
      out.push('**キーワード：** ' + (e.keywords || []).join('、'));
      out.push('');
      out.push('**本文：** ' + (e.body || ''));
      out.push('');
    });
    if (lb.notes && lb.notes.trim()) {
      out.push('---');
      out.push('');
      out.push('<!-- 以下はロアブック外のメモ（Lorebook Lab が保存していた注記） -->');
      out.push('');
      out.push(stripEntryish(lb.notes));
      out.push('');
    }
    return out.join('\n');
  }

  // メモ欄の ### 見出しは太字に変える（再読み込み時に項目と誤認しないため）
  function stripEntryish(notes) {
    return String(notes).split('\n').map(function (l) {
      return l.replace(/^#{3,}\s+(.*)$/, '**$1**');
    }).join('\n');
  }

  /* ---------- JSON ---------- */

  var JSON_FORMAT = 'lorebook-lab';
  var JSON_VERSION = 1;

  function exportJSON(payload) {
    return JSON.stringify(Object.assign({ format: JSON_FORMAT, formatVersion: JSON_VERSION, exportedAt: new Date().toISOString() }, payload), null, 2);
  }

  /**
   * JSON を読み込む。Lorebook Lab 形式のほか、
   * 単体のロアブック {name, entries:[...]} や項目配列 [...] も受け付ける。
   */
  function parseJSON(text) {
    var data = JSON.parse(String(text).replace(/^﻿/, ''));
    var lorebooks = [];
    var extras = {};
    function normEntry(e) {
      var kws = e.keywords || e.keys || e.key || e.keyword || [];
      if (typeof kws === 'string') kws = splitKeywords(kws);
      return {
        id: uid('e'),
        no: e.no != null ? String(e.no) : '',
        title: String(e.title || e.name || e.comment || ''),
        category: String(e.category || ''),
        keywords: kws.map(cleanKeyword).filter(Boolean),
        body: String(e.body || e.content || e.text || '')
      };
    }
    function normLb(lb) {
      var now = new Date().toISOString();
      return {
        id: uid('lb'),
        name: String(lb.name || '読み込んだロアブック'),
        version: String(lb.version || ''),
        notes: String(lb.notes || ''),
        entries: (lb.entries || []).map(normEntry),
        createdAt: lb.createdAt || now,
        updatedAt: now
      };
    }
    if (Array.isArray(data)) {
      lorebooks.push(normLb({ entries: data }));
    } else if (data && data.format === JSON_FORMAT) {
      (data.lorebooks || []).forEach(function (lb) { lorebooks.push(normLb(lb)); });
      if (data.lorebook) lorebooks.push(normLb(data.lorebook));
      ['cases', 'records', 'vocab', 'turns'].forEach(function (k) { if (data[k]) extras[k] = data[k]; });
    } else if (data && Array.isArray(data.entries)) {
      lorebooks.push(normLb(data));
    } else {
      throw new Error('ロアブックとして読める形ではありません');
    }
    return { lorebooks: lorebooks, extras: extras };
  }

  /** AI に Lorebook Lab 形式で出力させるための指示文 */
  function aiPrompt() {
    return [
      '次のロアブックを、Lorebook Lab に読み込める Markdown 形式で出力してください。',
      '',
      '【形式】',
      '# ロアブック名 v0.1',
      '',
      '## 分類名（任意）',
      '',
      '### 01｜項目名',
      '',
      '**キーワード：** 語1、語2、語3、語4、語5',
      '',
      '**本文：** 登録する本文（1段落）',
      '',
      '【ルール】',
      '- 1項目につき見出しは「### 番号｜項目名」の1行だけにする',
      '- キーワードは最大5個。読点「、」で区切り、括弧・引用符・説明は付けない',
      '- キーワードは実際に登録する文字列そのままで書く（ひらがな・カタカナ・漢字の言い換えや活用形を自動で増やさない）',
      '- 本文は「**本文：**」の後に書く',
      '- 注意書きや解説は、すべての項目の後に「---」を入れてから書く',
      '- 全体を ```markdown のコードブロックで囲んで出力する'
    ].join('\n');
  }

  return {
    MAX_KEYWORDS: MAX_KEYWORDS,
    uid: uid,
    splitKeywords: splitKeywords,
    splitHeading: splitHeading,
    parseMarkdown: parseMarkdown,
    validate: validate,
    toLorebook: toLorebook,
    toMarkdown: toMarkdown,
    exportJSON: exportJSON,
    parseJSON: parseJSON,
    aiPrompt: aiPrompt
  };
});
