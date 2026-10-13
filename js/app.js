/*
 * Lorebook Lab — 画面
 *
 * 判定ロジックはすべて js/core/*.js にあり、このファイルは表示と保存だけを担う。
 * データはこのブラウザの localStorage にだけ保存し、外部へは送らない。
 */
(function () {
  'use strict';

  var LL = window.LL;
  var M = LL.matcher, P = LL.parser, A = LL.audit, CMP = LL.compare, CH = LL.chain;
  var STORAGE_KEY = 'lorebook-lab:v1';

  /* ================= 状態と保存 ================= */

  function withId(o) { return Object.assign({ id: P.uid('c') }, o); }

  function sampleLorebook() {
    return P.toLorebook(P.parseMarkdown(LL.sample.markdown));
  }

  function freshState(withSample) {
    var lb = withSample ? sampleLorebook() : null;
    return {
      schema: 1,
      lorebooks: lb ? [lb] : [],
      activeId: lb ? lb.id : null,
      compareOldId: lb ? lb.id : null,
      compareNewId: lb ? lb.id : null,
      sim: withSample ? { user: LL.sample.userText, ai: LL.sample.aiText } : { user: '', ai: '' },
      compareText: withSample ? LL.sample.aiText : '',
      cases: withSample ? A.sampleCases().map(withId) : [],
      records: [],
      vocab: A.defaultVocab(),
      turns: withSample ? CH.sampleTurns() : [{ role: 'user', text: '' }],
      tab: 'sim',
      auditView: 'cases',
      recordFilter: 'all',
      editingId: null,
      guideSeen: false
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.lorebooks)) return null;
      var base = freshState(false);
      Object.keys(base).forEach(function (k) { if (s[k] === undefined) s[k] = base[k]; });
      s.editingId = null;
      return s;
    } catch (e) { return null; }
  }

  var state = load() || freshState(true);
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  function saveNow() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できない環境では表示だけ続ける */ }
  }

  function activeLb() {
    return state.lorebooks.find(function (l) { return l.id === state.activeId; }) || state.lorebooks[0] || null;
  }
  function lbById(id) { return state.lorebooks.find(function (l) { return l.id === id; }) || null; }
  function lbName(lb) { return lb ? [lb.name, lb.version].filter(Boolean).join(' ') : ''; }
  /** 選択肢用：狭い画面でも版が見えるよう版を先に出す */
  function lbOption(lb) { return lb ? (lb.version ? lb.version + '｜' : '') + lb.name : ''; }

  /* ================= 小道具 ================= */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var view = $('#view');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /** 入力に合わせて textarea の高さを伸ばす（最大は画面の6割） */
  function autosize(ta) {
    if (!ta || ta.tagName !== 'TEXTAREA' || ta.readOnly) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, Math.round(window.innerHeight * 0.6)) + 'px';
  }
  function autosizeAll(root) { $$('textarea', root).forEach(autosize); }

  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  function entryLabel(e) {
    if (!e) return '';
    return (e.no ? '<span class="no">No.' + esc(e.no) + '</span> ' : '') + esc(e.title || '（無題）');
  }
  function entryPlain(e) { return e ? (e.no ? 'No.' + e.no + ' ' : '') + (e.title || '（無題）') : ''; }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  var toastTimer;
  function toast(msg) {
    var el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /** 画面下から出るシート。actions: [{label, cls, onClick(close) → false で閉じない}] */
  function sheet(opts) {
    var back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<h2>' + esc(opts.title) + '</h2>' + (opts.html || '') +
      '<div class="row end sheet-actions"></div></div>';
    var actions = $('.sheet-actions', back);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    (opts.actions || [{ label: '閉じる' }]).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.onClick && a.onClick(close, back) === false) return;
        close();
      });
      actions.appendChild(b);
    });
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    var first = $('input, textarea, select', back) || $('.sheet-actions .btn', back);
    if (first && opts.focus === true) first.focus({ preventScroll: true });
    return { el: back, close: close };
  }

  function confirmSheet(title, message, okLabel, onOk) {
    sheet({
      title: title,
      html: '<p>' + esc(message) + '</p>',
      focus: false,
      actions: [{ label: 'やめる' }, { label: okLabel, cls: 'danger', onClick: function () { onOk(); } }]
    });
  }

  function copyText(text, fallbackEl) {
    function fallback() {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); toast('選択しました。コピーしてください'); }
      else toast('コピーできませんでした');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('コピーしました'); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) { return false; }
  }

  /** 書き出し：保存ボタンとコピー欄を両方出す（保存が使えない環境でもコピーで持ち出せる） */
  function exportSheet(title, filename, text, mime) {
    var s = sheet({
      title: title,
      html: '<p class="hint">' + esc(filename) + '</p><textarea class="export" id="export-text" readonly></textarea>',
      focus: false,
      actions: [
        { label: '閉じる' },
        { label: 'コピー', onClick: function (c, root) { copyText(text, $('#export-text', root)); return false; } },
        { label: 'ファイルに保存', cls: 'primary', onClick: function () { if (!download(filename, text, mime)) toast('保存できない環境です。コピーしてください'); return false; } }
      ]
    });
    $('#export-text', s.el).value = text;
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  function safeName(s) { return String(s || 'lorebook').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60); }

  /* ================= ハイライト ================= */

  function highlightHTML(text, occurrences, near, entries) {
    var byId = {};
    (entries || []).forEach(function (e) { byId[e.id] = e; });
    var marks = occurrences.map(function (o) { return Object.assign({ kind: 'hit' }, o); })
      .concat((near || []).map(function (n) { return { kind: 'near', start: n.start, end: n.end, entryId: n.entryId, keyword: n.keyword }; }));
    return M.segments(text, marks).map(function (seg) {
      var hits = seg.occ.filter(function (o) { return o.kind === 'hit'; });
      if (hits.length) {
        var ids = hits.map(function (o) { return o.entryId; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        var title = hits.map(function (o) { return entryPlain(byId[o.entryId]) + '「' + o.keyword + '」'; }).join(' / ');
        return '<mark class="hl' + (ids.length > 1 ? ' multi' : '') + '" data-entries="' + esc(ids.join(' ')) + '" title="' + esc(title) + '">' + esc(seg.text) + '</mark>';
      }
      if (seg.occ.length) {
        var n = seg.occ[0];
        return '<mark class="near" title="' + esc('表記ゆれ：キーワード「' + n.keyword + '」とは別表記') + '">' + esc(seg.text) + '</mark>';
      }
      return esc(seg.text);
    }).join('');
  }

  function snippetHTML(text, start, end, radius) {
    var s = M.snippet(text, start, end, radius);
    return esc(s.before) + '<b>' + esc(s.hit) + '</b>' + esc(s.after);
  }

  /* ================= 記録（手動の判定） ================= */

  var REC_LABEL = { appropriate: '適切な一致', inappropriate: '不適切な一致', missed: '拾い漏れ' };
  var REC_CLASS = { appropriate: 'ok', inappropriate: 'fp', missed: 'miss' };
  var SRC_LABEL = { user: 'ユーザー発言', ai: 'AI生成文', compare: '比較', turn: '連動' };

  function findRecord(q) {
    return state.records.find(function (r) {
      return r.textKey === q.textKey && r.entryId === q.entryId && r.keyword === q.keyword && r.start === q.start && r.source === q.source && r.label !== 'missed';
    });
  }

  function makeRecord(o) {
    var lb = activeLb();
    var e = lb && lb.entries.find(function (x) { return x.id === o.entryId; });
    return Object.assign({
      id: P.uid('r'),
      lorebookId: lb ? lb.id : '',
      lorebook: lbName(lb),
      entryNo: e ? e.no : '',
      entryTitle: e ? e.title : '',
      memo: '',
      createdAt: new Date().toISOString()
    }, o);
  }

  /* ================= 画面の土台 ================= */

  function renderPicker() {
    var sel = $('#active-lb');
    if (!state.lorebooks.length) {
      sel.innerHTML = '<option value="">ロアブックなし</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    var cur = activeLb();
    sel.innerHTML = state.lorebooks.map(function (l) {
      return '<option value="' + esc(l.id) + '"' + (cur && cur.id === l.id ? ' selected' : '') + '>' + esc(lbOption(l)) + '</option>';
    }).join('');
  }

  function setTab(tab) {
    state.tab = tab;
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    save();
    renderView();
    window.scrollTo(0, 0);
  }

  function renderView() {
    renderPicker();
    var fn = { sim: viewSim, audit: viewAudit, compare: viewCompare, chain: viewChain, manage: viewManage }[state.tab] || viewSim;
    fn();
    autosizeAll(view);
  }

  function noLorebookPanel() {
    return '<section class="panel"><h2>ロアブックがありません</h2>' +
      '<p class="hint">項目名・キーワード・本文を入れるだけで作れます。Markdown を読み込むこともできます（管理タブ）。</p>' +
      '<div class="row"><button class="btn primary" data-action="new-lb">新しいロアブックを作る</button><button class="btn" data-action="add-sample">サンプルを読み込む</button></div></section>';
  }

  /* ================= 照合 ================= */

  function viewSim() {
    view.innerHTML = welcomePanel() +
      '<section class="panel">' +
        '<div class="panel-head"><span class="eyebrow">String match</span><h2>文字列一致シミュレーター</h2>' +
        '<p class="hint">登録キーワードとの部分一致だけで判定します。ひらがな・カタカナ、全角・半角、大文字・小文字は変換せず、活用形も補いません。表示されるのは実機の発火状態ではなく「発火候補」です。</p></div>' +
        '<div class="grid-2">' +
          '<label class="field"><span class="field-label"><span class="pill user">ユーザー発言</span></span><textarea id="sim-user" placeholder="ユーザーの発言を貼り付け"></textarea></label>' +
          '<label class="field"><span class="field-label"><span class="pill ai">AI生成文</span></span><textarea id="sim-ai" placeholder="AIの生成文を貼り付け"></textarea></label>' +
        '</div>' +
        '<div class="row"><button class="btn small" id="sim-sample" type="button">例文を入れる</button><button class="btn small" id="sim-clear" type="button">入力を消す</button>' +
        '<button class="btn small" type="button" data-action="quick-add">＋項目を登録</button>' +
        '<span class="spacer"></span><button class="btn small" id="sim-missed" type="button">拾い漏れを記録</button></div>' +
      '</section>' +
      '<div id="sim-out" class="list"></div>';

    var u = $('#sim-user'), a = $('#sim-ai');
    u.value = state.sim.user || '';
    a.value = state.sim.ai || '';
    var rerender = debounce(renderSimResults, 120);
    u.addEventListener('input', function () { state.sim.user = u.value; save(); rerender(); });
    a.addEventListener('input', function () { state.sim.ai = a.value; save(); rerender(); });
    $('#sim-sample').addEventListener('click', function () {
      u.value = state.sim.user = LL.sample.userText;
      a.value = state.sim.ai = LL.sample.aiText;
      save(); renderSimResults(); autosize(u); autosize(a);
    });
    $('#sim-clear').addEventListener('click', function () {
      u.value = a.value = state.sim.user = state.sim.ai = '';
      save(); renderSimResults(); autosize(u); autosize(a);
    });
    $('#sim-missed').addEventListener('click', function () { missedSheet(); });
    renderSimResults();
  }

  function renderSimResults() {
    var out = $('#sim-out');
    if (!out) return;
    var lb = activeLb();
    if (!lb) { out.innerHTML = noLorebookPanel(); return; }
    var entries = lb.entries;
    var srcs = [
      { key: 'user', text: state.sim.user || '' },
      { key: 'ai', text: state.sim.ai || '' }
    ];
    var results = srcs.map(function (s) {
      return { src: s.key, text: s.text, r: M.analyze(s.text, entries), near: M.nearMisses(s.text, entries) };
    });
    var union = {};
    results.forEach(function (x) { x.r.matched.forEach(function (m) { union[m.entry.id] = m.entry; }); });
    var unionList = entries.filter(function (e) { return union[e.id]; });

    var html = '<section class="panel">' +
      '<div class="counters">' +
        '<div class="counter"><b>' + results[0].r.matched.length + '</b><span>ユーザー発言で一致</span></div>' +
        '<div class="counter"><b>' + results[1].r.matched.length + '</b><span>AI生成文で一致</span></div>' +
        '<div class="counter"><b>' + unionList.length + '<small class="meta"> / ' + entries.length + '</small></b><span>合わせた項目数</span></div>' +
      '</div>' +
      '<div class="field"><span class="field-label">次のAI生成に影響しうる候補（両方の和）</span>' +
        (unionList.length ? '<div class="chips">' + unionList.map(function (e) { return '<span class="chip">' + entryLabel(e) + '</span>'; }).join('') + '</div>' : '<p class="empty">なし</p>') +
      '</div></section>';

    results.forEach(function (x) {
      if (!x.text.trim()) return;
      html += specimenCard(x, entries);
    });
    if (!results.some(function (x) { return x.text.trim(); })) {
      html += '<section class="panel"><p class="empty">上の欄に文章を入れると、一致箇所がここに出ます。</p></section>';
    }
    out.innerHTML = html;
  }

  function specimenCard(x, entries) {
    var r = x.r;
    var srcClass = x.src;
    var chars = Array.from(x.text).length;
    var html = '<article class="specimen" data-src="' + x.src + '">' +
      '<div class="specimen-label"><span class="pill ' + srcClass + '">' + SRC_LABEL[x.src] + '</span>' +
      '<span class="mono meta">' + chars + '文字</span><span class="spacer"></span>' +
      '<span class="meta">一致 <b class="mono">' + r.matched.length + '</b> 項目・<b class="mono">' + r.totalHits + '</b> 箇所</span></div>' +
      '<div class="specimen-body">' +
      '<div class="highlight">' + highlightHTML(x.text, r.occurrences, x.near, entries) + '</div>' + replyLimitNotice(r.matched, activeLb());

    html += '<div class="list">';
    if (!r.matched.length) html += '<p class="empty">一致した項目はありません。</p>';
    r.matched.forEach(function (m) {
      var e = m.entry;
      html += '<div class="hit" id="hit-' + x.src + '-' + esc(e.id) + '">' +
        '<div class="hit-head">' + (e.no ? '<span class="no">No.' + esc(e.no) + '</span>' : '') + '<span class="hit-title">' + esc(e.title) + '</span>' +
        '<span class="spacer"></span><span class="mono meta">' + m.total + '回</span></div>' +
        '<div class="chips">' + m.hits.map(function (h) { return '<span class="chip kw">' + esc(h.keyword) + '<span class="n">×' + h.count + '</span></span>'; }).join('') + '</div>';
      m.hits.forEach(function (h) {
        h.positions.forEach(function (p) {
          var q = { textKey: hash(x.text), entryId: e.id, keyword: h.keyword, start: p.start, source: x.src };
          var rec = findRecord(q);
          html += '<div class="occ"><span class="occ-pos">' + M.charNumber(x.text, p.start) + '文字目</span>' +
            '<span class="occ-text">' + snippetHTML(x.text, p.start, p.end) + '</span>' +
            '<span class="occ-actions">' +
            recButton('appropriate', '適切', q, p, rec) + recButton('inappropriate', '不適切', q, p, rec) +
            '</span></div>';
        });
      });
      html += '</div>';
    });
    html += '</div>';

    if (x.near.length) {
      html += '<details class="fold" open><summary>表記ゆれで拾えていない箇所 <span class="pill miss">' + x.near.length + '</span></summary><div class="fold-body">' +
        '<p class="hint">実機では表記を変換しないので、ここは一致しません。拾いたい場合は、この表記もキーワードに入れる必要があります。</p>';
      x.near.forEach(function (n) {
        var e = entries.find(function (z) { return z.id === n.entryId; });
        html += '<div class="miss-row"><span class="occ-pos">' + M.charNumber(x.text, n.start) + '文字目</span>' +
          '<span>文中「<b>' + esc(n.found) + '</b>」⇔ キーワード「' + esc(n.keyword) + '」</span>' +
          '<span class="meta">' + entryLabel(e) + '</span>' +
          n.reasons.map(function (rs) { return '<span class="pill miss">' + esc(rs) + '</span>'; }).join('') +
          '<button class="btn small" type="button" data-near-rec="1" data-src="' + x.src + '" data-entry="' + esc(n.entryId) + '" data-found="' + esc(n.found) + '" data-start="' + n.start + '" data-end="' + n.end + '">拾い漏れとして記録</button></div>';
      });
      html += '</div></details>';
    }

    html += '<details class="fold"><summary>一致しなかった項目 <span class="mono meta">' + r.unmatched.length + '</span></summary><div class="fold-body">';
    if (!r.unmatched.length) html += '<p class="empty">すべての項目が一致しました。</p>';
    r.unmatched.forEach(function (e) {
      html += '<div class="miss-row"><span>' + entryLabel(e) + '</span><span class="chips">' +
        M.activeKeywords(e).map(function (k) { return '<span class="chip">' + esc(k) + '</span>'; }).join('') + '</span></div>';
    });
    html += '</div></details></div></article>';
    return html;
  }

  function recButton(label, text, q, p, rec) {
    var pressed = rec && rec.label === label;
    return '<button class="btn small" type="button" data-rec="' + label + '" aria-pressed="' + (pressed ? 'true' : 'false') + '"' +
      ' data-src="' + q.source + '" data-entry="' + esc(q.entryId) + '" data-kw="' + esc(q.keyword) + '" data-start="' + p.start + '" data-end="' + p.end + '">' + text + '</button>';
  }

  function onSimClick(e) {
    var t = e.target;
    var mark = t.closest('mark.hl');
    if (mark) {
      var card = mark.closest('.specimen');
      var id = (mark.dataset.entries || '').split(' ')[0];
      var target = id && document.getElementById('hit-' + card.dataset.src + '-' + id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
      }
      return;
    }
    var rb = t.closest('[data-rec]');
    if (rb) {
      var src = rb.dataset.src;
      var text = state.sim[src] || '';
      var q = { textKey: hash(text), entryId: rb.dataset.entry, keyword: rb.dataset.kw, start: +rb.dataset.start, source: src };
      var existing = findRecord(q);
      if (existing && existing.label === rb.dataset.rec) {
        state.records = state.records.filter(function (r) { return r !== existing; });
        toast('記録を取り消しました');
      } else if (existing) {
        existing.label = rb.dataset.rec;
        toast(REC_LABEL[existing.label] + 'に変えました');
      } else {
        state.records.unshift(makeRecord(Object.assign(q, {
          label: rb.dataset.rec, end: +rb.dataset.end, text: text.slice(0, 2000),
          snippet: M.snippet(text, q.start, +rb.dataset.end, 24)
        })));
        toast(REC_LABEL[rb.dataset.rec] + 'として記録しました');
      }
      save(); renderSimResults();
      return;
    }
    var nb = t.closest('[data-near-rec]');
    if (nb) {
      var s2 = nb.dataset.src, text2 = state.sim[s2] || '';
      state.records.unshift(makeRecord({
        label: 'missed', source: s2, entryId: nb.dataset.entry, keyword: nb.dataset.found,
        start: +nb.dataset.start, end: +nb.dataset.end, textKey: hash(text2), text: text2.slice(0, 2000),
        snippet: M.snippet(text2, +nb.dataset.start, +nb.dataset.end, 24), memo: '表記ゆれ'
      }));
      save();
      toast('拾い漏れとして記録しました');
    }
  }

  function missedSheet() {
    var lb = activeLb();
    if (!lb) { toast('ロアブックがありません'); return; }
    var hasAi = (state.sim.ai || '').trim() && !(state.sim.user || '').trim();
    var s = sheet({
      title: '拾い漏れを記録',
      html: '<p class="hint">本来は一致してほしかったのに一致しなかった項目を記録します。</p>' +
        '<div class="field"><span class="field-label">どの文で</span><div class="seg" id="ms-src">' +
          '<button type="button" data-v="user" aria-pressed="' + (!hasAi) + '">ユーザー発言</button>' +
          '<button type="button" data-v="ai" aria-pressed="' + (!!hasAi) + '">AI生成文</button></div></div>' +
        '<label class="field"><span class="field-label">一致してほしかった項目</span><select id="ms-entry">' +
          lb.entries.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(entryPlain(e)) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="field-label">拾ってほしかった語句（文中の表記）</span><input type="text" id="ms-word" placeholder="例：目を合わせ"></label>' +
        '<label class="field"><span class="field-label">メモ</span><input type="text" id="ms-memo" placeholder="任意"></label>',
      actions: [{ label: 'やめる' }, {
        label: '記録する', cls: 'primary', onClick: function (c, root) {
          var src = $('#ms-src [aria-pressed="true"]', root).dataset.v;
          var text = state.sim[src] || '';
          var word = $('#ms-word', root).value.trim();
          var start = word ? text.indexOf(word) : -1;
          state.records.unshift(makeRecord({
            label: 'missed', source: src, entryId: $('#ms-entry', root).value, keyword: word,
            start: start, end: start >= 0 ? start + word.length : -1, textKey: hash(text), text: text.slice(0, 2000),
            snippet: start >= 0 ? M.snippet(text, start, start + word.length, 24) : { before: text.slice(0, 60), hit: '', after: text.length > 60 ? '…' : '' },
            memo: $('#ms-memo', root).value.trim()
          }));
          save();
          toast('拾い漏れとして記録しました');
        }
      }]
    });
    segToggle($('#ms-src', s.el));
  }

  function segToggle(seg, onChange) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      $$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      if (onChange) onChange(b.dataset.v);
    });
  }

  /* ================= 監査 ================= */

  function viewAudit() {
    var v = state.auditView;
    view.innerHTML =
      '<section class="panel"><div class="panel-head"><span class="eyebrow">Audit</span><h2>誤発火・拾い漏れの監査</h2>' +
      '<p class="hint">文字列が一致したかどうかまでは機械で分かりますが、それが場面として適切かは判断できません。そこはケースと記録で人が決めます。</p></div>' +
      '<div class="seg" id="audit-seg">' +
        '<button type="button" data-v="cases" aria-pressed="' + (v === 'cases') + '">監査ケース</button>' +
        '<button type="button" data-v="records" aria-pressed="' + (v === 'records') + '">手動の記録</button>' +
        '<button type="button" data-v="design" aria-pressed="' + (v === 'design') + '">設計点検</button>' +
      '</div></section><div id="audit-body" class="list"></div>';
    segToggle($('#audit-seg'), function (val) { state.auditView = val; save(); renderAuditBody(); });
    renderAuditBody();
  }

  function renderAuditBody() {
    var body = $('#audit-body');
    if (!body) return;
    if (state.auditView === 'records') return renderRecords(body);
    if (state.auditView === 'design') return renderDesign(body);
    return renderCases(body);
  }

  var STATUS_CLASS = { pass: 'ok', 'false-positive': 'fp', missed: 'miss', 'missing-entry': 'warn' };

  function renderCases(body) {
    var lb = activeLb();
    var ev = A.evaluateCases(state.cases, lb);
    var order = { 'false-positive': 0, missed: 1, 'missing-entry': 2, pass: 3 };
    var sorted = ev.results.slice().sort(function (a, b) { return order[a.result.status] - order[b.result.status]; });

    body.innerHTML =
      '<section class="panel">' +
        '<div class="counters">' +
          '<div class="counter fp"><b>' + ev.summary['false-positive'] + '</b><span>誤発火候補</span></div>' +
          '<div class="counter miss"><b>' + ev.summary.missed + '</b><span>拾い漏れ</span></div>' +
          '<div class="counter ok"><b>' + ev.summary.pass + '</b><span>想定どおり</span></div>' +
        '</div>' +
        '<p class="hint">判定に使うロアブック：' + esc(lbName(lb) || 'なし') + '（キーワード指定のケースはロアブックに関係なく判定）</p>' +
        '<details class="fold" id="case-fold"><summary>ケースを追加</summary><div class="fold-body">' +
          '<div class="field"><span class="field-label">何を調べるか</span><div class="seg" id="cf-type">' +
            '<button type="button" data-v="keyword" aria-pressed="true">キーワード1つ</button>' +
            '<button type="button" data-v="entry" aria-pressed="false">ロアブックの項目</button></div></div>' +
          '<label class="field" id="cf-kw-wrap"><span class="field-label">キーワード</span><input type="text" id="cf-kw" placeholder="例：急が"></label>' +
          '<label class="field" id="cf-entry-wrap" hidden><span class="field-label">項目</span><select id="cf-entry">' +
            (lb ? lb.entries.map(function (e) { return '<option value="' + esc(e.title) + '">' + esc(entryPlain(e)) + '</option>'; }).join('') : '') +
          '</select></label>' +
          '<label class="field"><span class="field-label">例文</span><textarea id="cf-text" placeholder="例：急ぐ必要はない。"></textarea></label>' +
          '<div class="field"><span class="field-label">この例文で</span><div class="seg" id="cf-expect">' +
            '<button type="button" data-v="match" aria-pressed="true">一致してほしい</button>' +
            '<button type="button" data-v="nomatch" aria-pressed="false">一致してほしくない</button></div></div>' +
          '<label class="field"><span class="field-label">メモ</span><input type="text" id="cf-memo" placeholder="任意"></label>' +
          '<div class="row end"><button class="btn primary" type="button" id="cf-add">追加</button></div>' +
        '</div></details>' +
      '</section>' +
      '<div class="list" id="case-list"></div>' +
      '<section class="panel"><div class="row"><button class="btn small" type="button" id="case-sample">サンプルケースを足す</button>' +
        '<span class="spacer"></span><button class="btn small danger" type="button" id="case-clear"' + (state.cases.length ? '' : ' disabled') + '>ケースを全部削除</button></div></section>';

    var list = $('#case-list', body);
    if (!sorted.length) list.innerHTML = '<section class="panel"><p class="empty">ケースはまだありません。「ケースを追加」から登録できます。</p></section>';
    else list.innerHTML = sorted.map(function (x) {
      var c = x.case, r = x.result;
      var hl = r.hits.length ? highlightHTML(c.text, r.hits.map(function (h) { return { start: h.start, end: h.end, entryId: h.entryId || '', keyword: h.keyword }; }), [], lb ? lb.entries : []) : esc(c.text);
      return '<div class="hit">' +
        '<div class="hit-head"><span class="pill ' + STATUS_CLASS[r.status] + '">' + esc(r.label) + '</span>' +
          '<span class="meta">' + (c.targetType === 'entry' ? '項目' : 'キーワード') + '</span><b>' + esc(c.targetType === 'entry' && r.entry ? entryPlain(r.entry) : c.target) + '</b>' +
          '<span class="spacer"></span><span class="meta">期待：' + (c.expect === 'nomatch' ? '一致してほしくない' : '一致してほしい') + '</span></div>' +
        '<div class="highlight">' + hl + '</div>' +
        (c.memo ? '<p class="meta">' + esc(c.memo) + '</p>' : '') +
        '<div class="row end"><button class="btn small ghost" type="button" data-case-del="' + esc(c.id) + '">削除</button></div>' +
        '</div>';
    }).join('');

    var typeSeg = $('#cf-type', body);
    segToggle(typeSeg, function (v) { $('#cf-kw-wrap', body).hidden = v !== 'keyword'; $('#cf-entry-wrap', body).hidden = v !== 'entry'; });
    segToggle($('#cf-expect', body));
    $('#cf-add', body).addEventListener('click', function () {
      var type = $('#cf-type [aria-pressed="true"]', body).dataset.v;
      var target = type === 'keyword' ? $('#cf-kw', body).value.trim() : $('#cf-entry', body).value;
      var text = $('#cf-text', body).value;
      if (!target) { toast(type === 'keyword' ? 'キーワードを入れてください' : '項目を選んでください'); return; }
      if (!text.trim()) { toast('例文を入れてください'); return; }
      state.cases.unshift(withId({ targetType: type, target: target, text: text, expect: $('#cf-expect [aria-pressed="true"]', body).dataset.v, memo: $('#cf-memo', body).value.trim() }));
      save(); renderCases(body);
      $('#case-fold', body).open = true;
      toast('ケースを追加しました');
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-case-del]');
      if (!b) return;
      state.cases = state.cases.filter(function (c) { return c.id !== b.dataset.caseDel; });
      save(); renderCases(body);
    });
    $('#case-sample', body).addEventListener('click', function () {
      var have = state.cases.map(function (c) { return c.target + '\u0000' + c.text; });
      var add = A.sampleCases().filter(function (c) { return have.indexOf(c.target + '\u0000' + c.text) === -1; }).map(withId);
      state.cases = state.cases.concat(add);
      save(); renderCases(body);
      toast(add.length ? add.length + '件追加しました' : 'サンプルはすべて登録済みです');
    });
    $('#case-clear', body).addEventListener('click', function () {
      confirmSheet('ケースを全部削除', '登録した監査ケース' + state.cases.length + '件を削除します。元に戻せません。', '削除する', function () {
        state.cases = []; save(); renderCases(body);
      });
    });
  }

  function renderRecords(body) {
    var f = state.recordFilter;
    var counts = { all: state.records.length, appropriate: 0, inappropriate: 0, missed: 0 };
    state.records.forEach(function (r) { counts[r.label] += 1; });
    var shown = state.records.filter(function (r) { return f === 'all' || r.label === f; });

    var html = '<section class="panel">' +
      '<div class="seg" id="rec-filter">' +
        ['all', 'inappropriate', 'missed', 'appropriate'].map(function (k) {
          return '<button type="button" data-v="' + k + '" aria-pressed="' + (f === k) + '">' + (k === 'all' ? 'すべて' : REC_LABEL[k]) + ' <span class="mono">' + counts[k] + '</span></button>';
        }).join('') +
      '</div>' +
      '<p class="hint">照合タブで一致箇所の「適切／不適切」を押すか、「拾い漏れを記録」から登録します。</p>' +
      '</section><div class="list">';
    if (!shown.length) html += '<section class="panel"><p class="empty">記録はまだありません。</p></section>';
    shown.forEach(function (r) {
      var snip = r.snippet || { before: '', hit: '', after: '' };
      html += '<div class="hit">' +
        '<div class="hit-head"><span class="pill ' + REC_CLASS[r.label] + '">' + REC_LABEL[r.label] + '</span>' +
          '<span class="pill ' + (r.source === 'ai' ? 'ai' : 'user') + '">' + (SRC_LABEL[r.source] || '') + '</span>' +
          '<b>' + esc((r.entryNo ? 'No.' + r.entryNo + ' ' : '') + r.entryTitle) + '</b>' +
          (r.keyword ? '<span class="chip kw">' + esc(r.keyword) + '</span>' : '') + '</div>' +
        '<div class="occ-text">' + esc(snip.before) + '<b>' + esc(snip.hit) + '</b>' + esc(snip.after) + '</div>' +
        '<p class="meta">' + esc(r.lorebook) + '・' + fmtDate(r.createdAt) + '</p>' +
        '<input type="text" data-rec-memo="' + esc(r.id) + '" value="' + esc(r.memo || '') + '" placeholder="メモ（例：剣道の場面なので適切）" aria-label="メモ">' +
        '<div class="row end"><button class="btn small" type="button" data-rec-case="' + esc(r.id) + '">監査ケースにする</button>' +
        '<button class="btn small ghost" type="button" data-rec-del="' + esc(r.id) + '">削除</button></div>' +
        '</div>';
    });
    html += '</div><section class="panel"><div class="row">' +
      '<button class="btn small" type="button" id="rec-md"' + (counts.all ? '' : ' disabled') + '>Markdownで書き出す</button>' +
      '<button class="btn small" type="button" id="rec-json"' + (counts.all ? '' : ' disabled') + '>JSONで書き出す</button>' +
      '<span class="spacer"></span><button class="btn small danger" type="button" id="rec-clear"' + (counts.all ? '' : ' disabled') + '>記録を全部削除</button></div></section>';
    body.innerHTML = html;

    segToggle($('#rec-filter', body), function (v) { state.recordFilter = v; save(); renderRecords(body); });
    body.oninput = onRecMemo;
    body.onclick = function (e) {
      var d = e.target.closest('[data-rec-del]');
      if (d) { state.records = state.records.filter(function (r) { return r.id !== d.dataset.recDel; }); save(); renderRecords(body); return; }
      var c = e.target.closest('[data-rec-case]');
      if (c) {
        var r = state.records.find(function (x) { return x.id === c.dataset.recCase; });
        if (!r) return;
        state.cases.unshift(withId({
          targetType: 'entry', target: r.entryTitle, text: r.text || (r.snippet ? r.snippet.before + r.snippet.hit + r.snippet.after : ''),
          expect: r.label === 'inappropriate' ? 'nomatch' : 'match', memo: [REC_LABEL[r.label], r.memo].filter(Boolean).join('：')
        }));
        save(); toast('監査ケースに追加しました');
      }
    };
    $('#rec-md', body).addEventListener('click', function () { exportSheet('記録の書き出し', 'lorebook-lab_records_' + stamp() + '.md', recordsMarkdown(), 'text/markdown'); });
    $('#rec-json', body).addEventListener('click', function () { exportSheet('記録の書き出し', 'lorebook-lab_records_' + stamp() + '.json', P.exportJSON({ records: state.records }), 'application/json'); });
    $('#rec-clear', body).addEventListener('click', function () {
      confirmSheet('記録を全部削除', '手動の記録' + state.records.length + '件を削除します。元に戻せません。', '削除する', function () {
        state.records = []; save(); renderRecords(body);
      });
    });
  }

  function onRecMemo(e) {
    var id = e.target.dataset && e.target.dataset.recMemo;
    if (!id) return;
    var r = state.records.find(function (x) { return x.id === id; });
    if (r) { r.memo = e.target.value; save(); }
  }

  function recordsMarkdown() {
    var out = ['# 監査記録（Lorebook Lab）', '', '書き出し：' + fmtDate(new Date().toISOString()), '', '※文字列一致による記録。実機の発火を確認したものではありません。', ''];
    ['inappropriate', 'missed', 'appropriate'].forEach(function (k) {
      var list = state.records.filter(function (r) { return r.label === k; });
      if (!list.length) return;
      out.push('## ' + REC_LABEL[k] + '（' + list.length + '）', '');
      list.forEach(function (r) {
        var s = r.snippet || { before: '', hit: '', after: '' };
        out.push('- ' + (r.entryNo ? 'No.' + r.entryNo + ' ' : '') + r.entryTitle +
          (r.keyword ? '｜「' + r.keyword + '」' : '') +
          '｜' + s.before + (s.hit ? '【' + s.hit + '】' : '') + s.after +
          '（' + (SRC_LABEL[r.source] || '') + '／' + r.lorebook + '）' +
          (r.memo ? '　メモ：' + r.memo : ''));
      });
      out.push('');
    });
    return out.join('\n');
  }

  function renderDesign(body) {
    var lb = activeLb();
    if (!lb) { body.innerHTML = noLorebookPanel(); return; }
    var r = A.staticAudit(lb, state.vocab);
    var kwCount = lb.entries.reduce(function (n, e) { return n + M.activeKeywords(e).length; }, 0);
    var structural = r.overLimit.length + r.empty.length + r.dupWithin.length + r.dupAcross.length;

    function section(title, count, cls, inner, open) {
      return '<details class="fold"' + (open ? ' open' : '') + '><summary>' + esc(title) + ' <span class="pill ' + (count ? cls : 'ok') + '">' + (count ? count : 'なし') + '</span></summary><div class="fold-body">' + inner + '</div></details>';
    }

    var html = '<section class="panel">' +
      '<div class="counters">' +
        '<div class="counter"><b>' + lb.entries.length + '</b><span>項目</span></div>' +
        '<div class="counter"><b>' + kwCount + '</b><span>キーワード</span></div>' +
        '<div class="counter fp"><b>' + r.vocabHits.length + '</b><span>日常語と一致</span></div>' +
        '<div class="counter"><b>' + r.singleChar.length + '</b><span>1文字の語</span></div>' +
      '</div>' +
      '<p class="hint">' + esc(lbName(lb)) + ' のキーワードそのものを点検します。入力文は使いません。</p></section>';

    // 構造
    var s1 = '';
    r.overLimit.forEach(function (x) { s1 += '<div class="miss-row"><span>' + entryLabel(x.entry) + '</span><span class="pill fp">6個目以降は照合されない</span>' + x.overflow.map(function (k) { return '<span class="chip off">' + esc(k) + '</span>'; }).join('') + '</div>'; });
    r.empty.forEach(function (x) { s1 += '<div class="miss-row"><span>' + entryLabel(x.entry) + '</span><span class="pill fp">キーワードなし</span></div>'; });
    r.dupWithin.forEach(function (x) { s1 += '<div class="miss-row"><span>' + entryLabel(x.entry) + '</span><span class="pill warn">項目内で重複</span><span class="chip">' + esc(x.keyword) + '</span></div>'; });
    r.dupAcross.forEach(function (x) { s1 += '<div class="miss-row"><span class="chip kw">' + esc(x.keyword) + '</span><span class="pill warn">複数の項目に登録</span><span class="meta">' + x.entries.map(entryLabel).join('・') + '</span></div>'; });
    html += section('上限・空欄・重複', structural, 'fp', s1 || '<p class="empty">5個上限・空欄・重複の問題はありません。</p>', structural > 0);

    // 包含
    var s2 = r.containment.map(function (c) {
      return '<div class="miss-row"><span class="chip kw">' + esc(c.short) + '</span><span>は</span><span class="chip">' + esc(c.long) + '</span><span>に含まれる</span>' +
        '<span class="meta">' + (c.sameEntry
          ? '同じ項目（' + entryLabel(c.shortEntry) + '）なので「' + esc(c.long) + '」は無くても拾える'
          : '「' + esc(c.long) + '」が出ると ' + entryLabel(c.shortEntry) + ' も一致する（' + entryLabel(c.longEntry) + '）') + '</span></div>';
    }).join('');
    html += section('キーワードの包含', r.containment.length, 'warn', s2 || '<p class="empty">あるキーワードが別のキーワードに含まれる組み合わせはありません。</p>', false);

    // 1文字
    var s3 = r.singleChar.length
      ? '<p class="hint">1文字は活用形をまとめて拾える反面、熟語にも一致します（例：斬→斬新）。下の「日常語との一致」と合わせて確認してください。</p><div class="chips">' +
        r.singleChar.map(function (x) { return '<span class="chip kw">' + esc(x.keyword) + '<span class="n">No.' + esc(x.entry.no || '-') + '</span></span>'; }).join('') + '</div>'
      : '<p class="empty">1文字のキーワードはありません。</p>';
    html += section('1文字キーワード', r.singleChar.length, 'warn', s3, false);

    // 語彙
    var s4 = '<p class="hint">下の語彙リストの語にキーワードが含まれているものです。文脈によっては誤発火になります。</p>';
    s4 += r.vocabHits.map(function (v) {
      return '<div class="miss-row"><span class="chip kw">' + esc(v.keyword) + '</span><span class="meta">' + entryLabel(v.entry) + '</span><span class="chips">' +
        v.words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') + '</span></div>';
    }).join('') || '<p class="empty">語彙リストの語に一致するキーワードはありません。</p>';
    html += section('日常語との一致（誤発火候補）', r.vocabHits.length, 'fp', s4, true);

    // 本文連鎖
    var s5 = '<p class="hint">登録本文に含まれるキーワードです。AIが本文の言い回しをそのまま書くと、その項目が次の生成でも候補になります。</p>';
    s5 += r.bodyChain.map(function (b) {
      return '<div class="miss-row"><span>' + entryLabel(b.entry) + ' の本文</span><span class="chips">' +
        b.targets.map(function (t) {
          return '<span class="chip' + (t.self ? '' : ' ai') + '">' + (t.self ? '自項目' : entryLabel(t.entry)) + '：' + esc(t.keywords.join('、')) + '</span>';
        }).join('') + '</span></div>';
    }).join('') || '<p class="empty">本文にキーワードは含まれていません。</p>';
    html += section('本文に含まれるキーワード（連鎖の可能性）', r.bodyChain.length, 'warn', s5, false);

    // 語彙編集
    html += '<section class="panel"><h3>誤発火チェック用の語彙リスト</h3>' +
      '<p class="hint">1行に1語。自分の会話で出てきそうな語を足すと、点検が実際の使い方に近づきます。</p>' +
      '<textarea id="vocab" rows="8"></textarea>' +
      '<div class="row end"><button class="btn small" type="button" id="vocab-reset">初期リストに戻す</button><button class="btn small primary" type="button" id="vocab-save">保存して点検</button></div></section>';

    body.innerHTML = html;
    $('#vocab', body).value = state.vocab.join('\n');
    $('#vocab-save', body).addEventListener('click', function () {
      state.vocab = $('#vocab', body).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      save(); renderDesign(body); toast('語彙リストを保存しました');
    });
    $('#vocab-reset', body).addEventListener('click', function () {
      state.vocab = A.defaultVocab(); save(); renderDesign(body); toast('初期リストに戻しました');
    });
  }

  /* ================= 比較 ================= */

  function viewCompare() {
    var lbs = state.lorebooks;
    if (!lbs.length) { view.innerHTML = noLorebookPanel(); return; }
    if (!lbById(state.compareOldId)) state.compareOldId = lbs[0].id;
    if (!lbById(state.compareNewId)) state.compareNewId = lbs[lbs.length - 1].id;
    function options(sel) {
      return lbs.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === sel ? ' selected' : '') + '>' + esc(lbOption(l)) + '</option>'; }).join('');
    }
    view.innerHTML =
      '<section class="panel"><div class="panel-head"><span class="eyebrow">Version diff</span><h2>バージョン比較</h2>' +
      '<p class="hint">同じ文で旧版と新版を照合し、結果の差を出します。項目は名前で対応づけ、名前が変わったものは番号で補います。</p></div>' +
      (lbs.length < 2 ? '<div class="notice">比較には2つ以上のロアブックが必要です。今のロアブックを複製して新版を作り、キーワードを変えてから比べられます。<div class="row" style="margin-top:8px"><button class="btn small primary" type="button" data-action="dup-active">今のロアブックを複製</button></div></div>' : '') +
      '<div class="grid-2">' +
        '<label class="field"><span class="field-label">旧版</span><select id="cmp-old">' + options(state.compareOldId) + '</select></label>' +
        '<label class="field"><span class="field-label">新版</span><select id="cmp-new">' + options(state.compareNewId) + '</select></label>' +
      '</div>' +
      '<div class="row"><button class="btn small" type="button" id="cmp-swap">旧版と新版を入れ替え</button></div>' +
      '<label class="field"><span class="field-label">比べる文</span><textarea id="cmp-text" placeholder="会話文を貼り付け"></textarea></label>' +
      '<div class="row"><button class="btn small" type="button" id="cmp-from-sim">照合タブの文を使う</button></div>' +
      '</section><div id="cmp-out" class="list"></div><div id="cmp-diff"></div>';

    var t = $('#cmp-text');
    t.value = state.compareText || '';
    var rer = debounce(renderCompare, 120);
    t.addEventListener('input', function () { state.compareText = t.value; save(); rer(); });
    $('#cmp-old').addEventListener('change', function (e) { state.compareOldId = e.target.value; save(); renderCompare(); });
    $('#cmp-new').addEventListener('change', function (e) { state.compareNewId = e.target.value; save(); renderCompare(); });
    $('#cmp-swap').addEventListener('click', function () {
      var a = state.compareOldId; state.compareOldId = state.compareNewId; state.compareNewId = a;
      $('#cmp-old').value = state.compareOldId; $('#cmp-new').value = state.compareNewId;
      save(); renderCompare();
    });
    $('#cmp-from-sim').addEventListener('click', function () {
      t.value = state.compareText = [state.sim.user, state.sim.ai].filter(function (s) { return s && s.trim(); }).join('\n');
      save(); renderCompare();
    });
    renderCompare();
  }

  function renderCompare() {
    var out = $('#cmp-out'), diffEl = $('#cmp-diff');
    if (!out) return;
    var oldLb = lbById(state.compareOldId), newLb = lbById(state.compareNewId);
    if (!oldLb || !newLb) { out.innerHTML = ''; diffEl.innerHTML = ''; return; }
    var same = oldLb.id === newLb.id;
    var r = CMP.compareText(state.compareText || '', oldLb, newLb);

    function kwChips(m) {
      return m ? m.hits.map(function (h) { return '<span class="chip kw">' + esc(h.keyword) + '<span class="n">×' + h.count + '</span></span>'; }).join('') : '';
    }
    function group(title, cls, items, render) {
      var inner = items.length ? items.map(render).join('') : '<p class="empty">なし</p>';
      return '<details class="fold"' + (items.length ? ' open' : '') + '><summary>' + esc(title) + ' <span class="pill ' + (items.length ? cls : 'neutral') + '">' + items.length + '</span></summary><div class="fold-body">' + inner + '</div></details>';
    }

    var html = '<section class="panel">' +
      (same ? '<div class="notice">旧版と新版に同じロアブックを選んでいます。</div>' : '') +
      '<div class="counters">' +
        '<div class="counter"><b>' + r.both.length + '</b><span>両方で一致</span></div>' +
        '<div class="counter"><b>' + r.oldOnly.length + '</b><span>旧版のみ</span></div>' +
        '<div class="counter"><b>' + r.newOnly.length + '</b><span>新版のみ</span></div>' +
        '<div class="counter miss"><b>' + r.lostByKeywordChange.length + '</b><span>変更による拾い漏れ</span></div>' +
      '</div></section>';

    if (!(state.compareText || '').trim()) {
      html += '<section class="panel"><p class="empty">比べる文を入れると、ここに結果が出ます。</p></section>';
    } else {
      html += group('キーワード変更によって一致しなくなった項目', 'miss', r.lostByKeywordChange, function (x) {
        return '<div class="miss-row"><span>' + entryLabel(x.pair.old) + '</span>' +
          (x.lostKeywords.length ? '<span class="meta">新版で消えた語：</span>' + x.lostKeywords.map(function (k) { return '<span class="chip off">' + esc(k) + '</span>'; }).join('') : '<span class="meta">一致していた語は残っています（別の変更の影響）</span>') +
          '</div>';
      });
      html += group('新版で項目ごと削除されて一致しなくなった', 'warn', r.removedEntries, function (x) {
        return '<div class="miss-row"><span>' + entryLabel(x.pair.old) + '</span>' + kwChips(x.old) + '</div>';
      });
      html += group('旧版のみ一致', 'fp', r.oldOnly, function (x) {
        return '<div class="miss-row"><span>' + entryLabel(x.pair.old) + '</span>' + kwChips(x.old) + '</div>';
      });
      html += group('新版のみ一致', 'ok', r.newOnly, function (x) {
        return '<div class="miss-row"><span>' + entryLabel(x.pair.new) + '</span>' + kwChips(x.new) + (x.pair.old ? '' : '<span class="pill ok">新規項目</span>') + '</div>';
      });
      html += group('両方で一致', 'neutral', r.both, function (x) {
        return '<div class="miss-row"><span>' + entryLabel(x.pair.new) + '</span><span class="meta">旧</span>' + kwChips(x.old) + '<span class="meta">新</span>' + kwChips(x.new) + '</div>';
      });
    }
    out.innerHTML = html;

    // キーワードの変更点（入力文と無関係）
    var diff = CMP.keywordDiff(oldLb, newLb);
    var d = '<section class="panel"><h3>キーワードと本文の変更点</h3>';
    if (same || !diff.length) d += '<p class="empty">キーワード・本文・項目名の差はありません。</p>';
    diff.forEach(function (p) {
      var tags = [];
      if (!p.old) tags.push('<span class="pill ok">新規項目</span>');
      if (!p.new) tags.push('<span class="pill fp">削除された項目</span>');
      if (p.renamed) tags.push('<span class="pill warn">項目名変更：' + esc(p.old.title) + ' → ' + esc(p.new.title) + '</span>');
      if (p.bodyChanged) tags.push('<span class="pill neutral">本文変更</span>');
      d += '<div class="miss-row"><span>' + entryLabel(p.new || p.old) + '</span>' + tags.join('') +
        p.added.map(function (k) { return '<span class="chip" style="background:var(--ok-bg);color:var(--ok-ink);border-color:transparent">＋' + esc(k) + '</span>'; }).join('') +
        p.removed.map(function (k) { return '<span class="chip off">－' + esc(k) + '</span>'; }).join('') + '</div>';
    });
    d += '</section>';
    diffEl.innerHTML = d;
  }

  /* ================= 連動 ================= */

  function viewChain() {
    view.innerHTML =
      '<section class="panel"><div class="panel-head"><span class="eyebrow">Turn chain</span><h2>連動分析</h2>' +
      '<p class="hint">会話をターンごとに入れると、各AI生成に影響しうる項目を時系列で並べます。</p></div>' +
      '<div class="notice">前提：キーワードが一致した項目は、その次のAI生成1回にだけ影響する（実機検証にもとづく設定）。ここでの表示は文字列一致からの推定で、実際にそのタイミングで発火したことを示すものではありません。</div>' +
      '<div id="turns" class="list"></div>' +
      '<div class="row"><button class="btn small" type="button" data-add-turn="user">＋ユーザー発言</button><button class="btn small" type="button" data-add-turn="ai">＋AI生成文</button>' +
      '<span class="spacer"></span><button class="btn small" type="button" id="turn-sample">例を入れる</button><button class="btn small ghost" type="button" id="turn-clear">全部消す</button></div>' +
      '</section><div id="chain-out"></div>';
    renderTurnEditor();
    $$('[data-add-turn]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.turns.push({ role: b.dataset.addTurn, text: '' });
        save(); renderTurnEditor(); renderChain();
        var areas = $$('#turns textarea'); if (areas.length) areas[areas.length - 1].focus();
      });
    });
    $('#turn-sample').addEventListener('click', function () { state.turns = CH.sampleTurns(); save(); renderTurnEditor(); renderChain(); });
    $('#turn-clear').addEventListener('click', function () {
      confirmSheet('ターンを全部消す', '入力したターン' + state.turns.length + '件を消します。', '消す', function () {
        state.turns = [{ role: 'user', text: '' }]; save(); renderTurnEditor(); renderChain();
      });
    });
    renderChain();
  }

  function renderTurnEditor() {
    var box = $('#turns');
    box.innerHTML = state.turns.map(function (t, i) {
      return '<div class="turn ' + t.role + '" data-i="' + i + '">' +
        '<div class="row"><span class="mono meta">T' + (i + 1) + '</span>' +
        '<div class="seg"><button type="button" data-role="user" aria-pressed="' + (t.role === 'user') + '">ユーザー</button><button type="button" data-role="ai" aria-pressed="' + (t.role === 'ai') + '">AI</button></div>' +
        '<span class="spacer"></span>' +
        '<button class="btn small ghost" type="button" data-move="-1" aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="btn small ghost" type="button" data-move="1" aria-label="下へ"' + (i === state.turns.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="btn small ghost" type="button" data-del-turn="1">削除</button></div>' +
        '<textarea id="turn-' + i + '" aria-label="T' + (i + 1) + 'の文" placeholder="' + (t.role === 'ai' ? 'AIの生成文' : 'ユーザーの発言') + '"></textarea></div>';
    }).join('');
    $$('textarea', box).forEach(function (ta, i) { ta.value = state.turns[i].text || ''; autosize(ta); });
  }

  var chainRerender = debounce(function () { renderChain(); }, 150);

  function onTurnsInput(e) {
    var item = e.target.closest('.turn');
    if (!item || e.target.tagName !== 'TEXTAREA') return;
    state.turns[+item.dataset.i].text = e.target.value;
    save(); chainRerender();
  }
  function onTurnsClick(e) {
    var item = e.target.closest('.turn');
    if (!item) return;
    var i = +item.dataset.i;
    var rb = e.target.closest('[data-role]');
    if (rb) { state.turns[i].role = rb.dataset.role; save(); renderTurnEditor(); renderChain(); return; }
    if (e.target.closest('[data-del-turn]')) {
      state.turns.splice(i, 1);
      if (!state.turns.length) state.turns.push({ role: 'user', text: '' });
      save(); renderTurnEditor(); renderChain(); return;
    }
    var mv = e.target.closest('[data-move]');
    if (mv) {
      var j = i + (+mv.dataset.move);
      if (j < 0 || j >= state.turns.length) return;
      var tmp = state.turns[i]; state.turns[i] = state.turns[j]; state.turns[j] = tmp;
      save(); renderTurnEditor(); renderChain();
    }
  }

  function renderChain() {
    var out = $('#chain-out');
    if (!out) return;
    var lb = activeLb();
    if (!lb) { out.innerHTML = noLorebookPanel(); return; }
    var r = CH.analyzeTurns(state.turns, lb.entries);

    function infChip(inf, withExtra) {
      var src = inf.sources.map(function (s) { return 'T' + (s.index + 1) + (s.role === 'ai' ? 'AI' : 'U'); }).join('・');
      return '<span class="inf-chip">' + entryLabel(inf.entry) + '<span class="src">← ' + esc(src) + '</span>' +
        (withExtra && inf.fromAiOnly ? '<span class="src">AI由来</span>' : '') +
        (withExtra && inf.streak >= 2 ? '<span class="streak">連続' + inf.streak + '回</span>' : '') +
        (withExtra && inf.reappears ? '<span class="again">↻文中にも</span>' : '') + '</span>';
    }

    var longIds = r.summary.longStreakEntryIds;
    var html = '<section class="panel"><div class="counters">' +
      '<div class="counter"><b>' + r.summary.turns + '</b><span>ターン</span></div>' +
      '<div class="counter"><b>' + r.summary.aiTurns + '</b><span>AI生成</span></div>' +
      '<div class="counter' + (longIds.length ? ' fp' : '') + '"><b>' + longIds.length + '</b><span>3回以上続く項目</span></div>' +
      '</div>';
    if (longIds.length) {
      html += '<div class="notice">同じ項目が3回以上続けて候補になっています：' +
        longIds.map(function (id) { return esc(entryPlain(lb.entries.find(function (e) { return e.id === id; }))); }).join('、') +
        '。AIが同じ語を書き続けると、その演出が毎回入りやすくなります。</div>';
    }
    html += '<div class="timeline">';
    r.rows.forEach(function (row) {
      var matched = row.result.matched;
      html += '<div class="tl-item"><div class="tl-rail"><span class="tl-dot ' + row.role + '"></span><span class="tl-line"></span></div><div class="tl-body">' +
        '<div class="row"><span class="mono meta">T' + (row.index + 1) + '</span><span class="pill ' + row.role + '">' + (row.role === 'ai' ? 'AI生成' : 'ユーザー') + '</span>' +
        '<span class="meta">一致 ' + matched.length + '項目</span></div>';
      if (row.role === 'ai') {
        html += '<div class="influence"><span class="influence-title">この生成に影響しうる候補</span>' +
          (row.influences.length ? '<div class="chips">' + row.influences.map(function (inf) { return infChip(inf, true); }).join('') + '</div>' : '<span class="meta">なし（直前に一致した項目がない）</span>') + '</div>';
      }
      html += '<div class="tl-text">' + (row.text.trim() ? highlightHTML(row.text, row.result.occurrences, [], lb.entries) : '<span class="meta">（空）</span>') + '</div>';
      if (matched.length) {
        html += '<div class="chips">' + matched.map(function (m) {
          return '<span class="chip">' + entryLabel(m.entry) + '<span class="n">' + esc(m.hits.map(function (h) { return h.keyword; }).join('、')) + '</span></span>';
        }).join('') + '</div>';
      }
      html += '</div></div>';
    });
    html += '<div class="tl-item"><div class="tl-rail"><span class="tl-dot next"></span></div><div class="tl-body">' +
      '<div class="influence"><span class="influence-title">次のAI生成に影響しうる候補</span>' +
      (r.pending.length ? '<div class="chips">' + r.pending.map(function (inf) { return infChip(inf, false); }).join('') + '</div>' : '<span class="meta">なし</span>') +
      '</div></div></div></div></section>';
    out.innerHTML = html;
  }

  /* ================= 管理 ================= */

  function viewManage() {
    if (state.editingId && lbById(state.editingId)) return viewEditor(lbById(state.editingId));
    state.editingId = null;
    var cur = activeLb();
    var html = '<section class="panel"><div class="panel-head"><span class="eyebrow">Lorebooks</span><h2>ロアブック</h2>' +
      '<p class="hint">「編集」で項目名・キーワード・本文を直接入力できます。編集画面の「発火テスト」で、その場で一致を確かめられます。</p></div>' +
      '<div class="row"><button class="btn primary" type="button" data-action="new-lb">＋新しいロアブック</button></div><div class="list">';
    if (!state.lorebooks.length) html += '<p class="empty">まだありません。下から読み込むか、サンプルを入れてください。</p>';
    state.lorebooks.forEach(function (l) {
      var warns = P.validate(l.entries);
      html += '<div class="lb-card' + (cur && cur.id === l.id ? ' active' : '') + '">' +
        '<div class="row"><span class="lb-name">' + esc(l.name) + '</span>' + (l.version ? '<span class="pill neutral">' + esc(l.version) + '</span>' : '') + '<span class="pill ' + (limitsFor(l).label === 'Zeta' ? 'user' : 'ai') + '">' + limitsFor(l).label + '</span>' +
        (cur && cur.id === l.id ? '<span class="pill ok">使用中</span>' : '') + '</div>' +
        '<div class="meta">' + l.entries.length + '項目・更新 ' + fmtDate(l.updatedAt) + (warns.length ? '・<span style="color:var(--warn-ink)">注意 ' + warns.length + '件</span>' : '') + '</div>' +
        '<div class="row">' +
          (cur && cur.id === l.id ? '' : '<button class="btn small primary" type="button" data-lb-use="' + esc(l.id) + '">使う</button>') +
          '<button class="btn small" type="button" data-lb-edit="' + esc(l.id) + '">編集</button>' +
          '<button class="btn small" type="button" data-lb-dup="' + esc(l.id) + '">複製</button>' +
          '<button class="btn small" type="button" data-lb-md="' + esc(l.id) + '">Markdown</button>' +
          '<button class="btn small" type="button" data-lb-json="' + esc(l.id) + '">JSON</button>' +
          '<span class="spacer"></span><button class="btn small danger" type="button" data-lb-del="' + esc(l.id) + '">削除</button>' +
        '</div></div>';
    });
    html += '</div></section>';

    html += '<section class="panel"><div class="panel-head"><span class="eyebrow">Import</span><h2>読み込み</h2>' +
      '<p class="hint">Markdown（.md / .txt）か JSON を読み込みます。ChatGPTやClaudeが出したMarkdownは、下の欄に貼り付けても読めます。読み込む前に内容を確認できます。</p></div>' +
      '<div class="row"><label class="btn primary" for="imp-file">ファイルを選ぶ</label><input type="file" id="imp-file" accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json" class="sr-only"></div>' +
      '<label class="field"><span class="field-label">または貼り付け</span><textarea id="imp-text" placeholder="# ロアブック名 v0.1&#10;### 01｜項目名&#10;**キーワード：** 語1、語2&#10;**本文：** ……"></textarea></label>' +
      '<div class="row end"><button class="btn" type="button" id="imp-go">貼り付けた内容を読み込む</button></div>' +
      '<details class="fold"><summary>AIに出力させるための指示文</summary><div class="fold-body">' +
        '<p class="hint">ChatGPTやClaudeでロアブックを作ったあと、これを送ると、このツールで読める形に整えて出力させられます。</p>' +
        '<pre class="prompt" id="ai-prompt"></pre>' +
        '<div class="row end"><button class="btn small primary" type="button" id="ai-copy">指示文をコピー</button></div>' +
      '</div></details></section>';

    html += '<section class="panel"><div class="panel-head"><span class="eyebrow">Data</span><h2>データ</h2>' +
      '<p class="hint">ロアブック・ケース・記録・語彙リストは、このブラウザの中だけに保存されます。外部へは送信しません。別の端末へ移すときは書き出しを使ってください。</p></div>' +
      '<div class="row"><button class="btn small" type="button" id="data-export">すべて書き出す（JSON）</button>' +
      '<button class="btn small" type="button" data-action="add-sample">サンプル v0.3 を追加</button>' +
      '<span class="spacer"></span><button class="btn small danger" type="button" id="data-wipe">すべてのデータを削除</button></div></section>';

    view.innerHTML = html;
    $('#ai-prompt').textContent = P.aiPrompt();

    view.onclick = function (e) {
      var t = e.target;
      var b;
      if ((b = t.closest('[data-lb-use]'))) { state.activeId = b.dataset.lbUse; save(); renderView(); toast('使うロアブックを切り替えました'); return; }
      if ((b = t.closest('[data-lb-edit]'))) { state.editingId = b.dataset.lbEdit; renderView(); window.scrollTo(0, 0); return; }
      if ((b = t.closest('[data-lb-dup]'))) { duplicateLb(lbById(b.dataset.lbDup)); renderView(); return; }
      if ((b = t.closest('[data-lb-md]'))) { var l1 = lbById(b.dataset.lbMd); exportSheet('Markdownで書き出し', safeName(lbName(l1)) + '.md', P.toMarkdown(l1), 'text/markdown'); return; }
      if ((b = t.closest('[data-lb-json]'))) { var l2 = lbById(b.dataset.lbJson); exportSheet('JSONで書き出し', safeName(lbName(l2)) + '.json', P.exportJSON({ lorebooks: [l2] }), 'application/json'); return; }
      if ((b = t.closest('[data-lb-del]'))) {
        var l3 = lbById(b.dataset.lbDel);
        confirmSheet('ロアブックを削除', '「' + lbName(l3) + '」（' + l3.entries.length + '項目）を削除します。元に戻せません。', '削除する', function () {
          state.lorebooks = state.lorebooks.filter(function (x) { return x.id !== l3.id; });
          if (state.activeId === l3.id) state.activeId = state.lorebooks[0] ? state.lorebooks[0].id : null;
          save(); renderView(); toast('削除しました');
        });
      }
    };
    $('#imp-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { importText(String(reader.result), f.name); e.target.value = ''; };
      reader.onerror = function () { toast('ファイルを読めませんでした'); };
      reader.readAsText(f, 'utf-8');
    });
    $('#imp-go').addEventListener('click', function () {
      var txt = $('#imp-text').value;
      if (!txt.trim()) { toast('貼り付け欄が空です'); return; }
      importText(txt, '');
    });
    $('#ai-copy').addEventListener('click', function () { copyText(P.aiPrompt(), null); });
    $('#data-export').addEventListener('click', function () {
      exportSheet('すべて書き出す', 'lorebook-lab_backup_' + stamp() + '.json',
        P.exportJSON({ lorebooks: state.lorebooks, cases: state.cases, records: state.records, vocab: state.vocab, turns: state.turns }), 'application/json');
    });
    $('#data-wipe').addEventListener('click', function () {
      confirmSheet('すべてのデータを削除', 'ロアブック・監査ケース・記録・語彙リスト・入力した会話を、このブラウザから削除します。元に戻せません。必要なら先に書き出してください。', 'すべて削除する', function () {
        try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* 無視 */ }
        state = freshState(false);
        state.tab = 'manage';
        saveNow();
        renderView();
        toast('すべてのデータを削除しました');
      });
    });
  }

  function bumpVersion(v) {
    var m = String(v || '').match(/^(v?)(\d+)\.(\d+)(.*)$/i);
    if (m) return (m[1] || 'v') + m[2] + '.' + (+m[3] + 1);
    return (v ? v + ' ' : '') + '複製';
  }

  function duplicateLb(src) {
    if (!src) return null;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = P.uid('lb');
    copy.version = bumpVersion(src.version);
    copy.entries.forEach(function (e) { e.id = P.uid('e'); });
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    var idx = state.lorebooks.indexOf(src);
    state.lorebooks.splice(idx + 1, 0, copy);
    state.compareOldId = src.id;
    state.compareNewId = copy.id;
    save();
    toast('複製しました（' + (copy.version || '新版') + '）');
    return copy;
  }

  function importText(text, fileName) {
    var trimmed = text.replace(/^\uFEFF/, '').trim();
    var isJSON = /\.json$/i.test(fileName || '') || /^[\[{]/.test(trimmed);
    if (isJSON) {
      try { previewJSON(P.parseJSON(trimmed)); }
      catch (err) { toast('JSONを読めませんでした：' + err.message); }
      return;
    }
    var parsed = P.parseMarkdown(text, { fallbackName: (fileName || '').replace(/\.[^.]+$/, '') });
    if (!parsed.entries.length) {
      sheet({
        title: '項目が見つかりませんでした',
        html: '<p>「### 項目名」の見出しと「**キーワード：**」の行が必要です。AIに出力させた場合は、管理タブの「AIに出力させるための指示文」を使うと読める形になります。</p>'
      });
      return;
    }
    previewMarkdown(parsed);
  }

  function previewMarkdown(parsed) {
    var w = parsed.warnings;
    var html = '<div class="grid-2">' +
      '<label class="field"><span class="field-label">名前</span><input type="text" id="pv-name"></label>' +
      '<label class="field"><span class="field-label">バージョン</span><input type="text" id="pv-ver"></label></div>' +
      '<p><b class="mono">' + parsed.entries.length + '</b> 項目を読み取りました。</p>' +
      (w.length ? '<div class="notice"><b>注意 ' + w.length + '件</b><br>' + w.slice(0, 30).map(function (x) { return esc(x.message); }).join('<br>') + (w.length > 30 ? '<br>…' : '') + '</div>' : '<p class="hint">キーワード数・空欄・重複に問題はありません。</p>') +
      '<div class="list">' + parsed.entries.slice(0, 40).map(function (e) {
        return '<div class="miss-row"><span>' + entryLabel(e) + '</span><span class="chips">' + e.keywords.map(function (k, i) {
          return '<span class="chip' + (i >= M.MAX_KEYWORDS ? ' off' : '') + '">' + esc(k) + '</span>';
        }).join('') + '</span></div>';
      }).join('') + (parsed.entries.length > 40 ? '<p class="meta">ほか ' + (parsed.entries.length - 40) + ' 項目</p>' : '') + '</div>';
    var s = sheet({
      title: '読み込みの確認',
      html: html,
      focus: false,
      actions: [{ label: 'やめる' }, {
        label: '登録する', cls: 'primary', onClick: function (c, root) {
          var lb = P.toLorebook(parsed, { name: $('#pv-name', root).value.trim() || parsed.name, version: $('#pv-ver', root).value.trim() });
          state.lorebooks.push(lb);
          state.activeId = lb.id;
          save(); renderView();
          toast('登録しました（' + lb.entries.length + '項目）');
        }
      }]
    });
    $('#pv-name', s.el).value = parsed.name;
    $('#pv-ver', s.el).value = parsed.version;
  }

  function previewJSON(res) {
    var ex = res.extras || {};
    var lines = res.lorebooks.map(function (l) { return '・' + esc(lbName(l)) + '（' + l.entries.length + '項目）'; });
    if (ex.cases) lines.push('・監査ケース ' + ex.cases.length + '件（追加）');
    if (ex.records) lines.push('・記録 ' + ex.records.length + '件（追加）');
    if (ex.vocab) lines.push('・語彙リスト（置き換え）');
    if (ex.turns) lines.push('・連動分析の会話（置き換え）');
    if (!lines.length) { toast('読み込めるデータがありません'); return; }
    sheet({
      title: 'JSONの読み込み',
      html: '<p>次の内容を読み込みます。</p><p>' + lines.join('<br>') + '</p>',
      focus: false,
      actions: [{ label: 'やめる' }, {
        label: '読み込む', cls: 'primary', onClick: function () {
          res.lorebooks.forEach(function (l) { state.lorebooks.push(l); });
          if (res.lorebooks[0]) state.activeId = res.lorebooks[0].id;
          if (Array.isArray(ex.cases)) state.cases = state.cases.concat(ex.cases.map(function (c) { return Object.assign({}, c, { id: P.uid('c') }); }));
          if (Array.isArray(ex.records)) state.records = ex.records.map(function (r) { return Object.assign({}, r, { id: P.uid('r') }); }).concat(state.records);
          if (Array.isArray(ex.vocab)) state.vocab = ex.vocab.map(String);
          if (Array.isArray(ex.turns)) state.turns = ex.turns.map(function (t) { return { role: t.role === 'ai' ? 'ai' : 'user', text: String(t.text || '') }; });
          save(); renderView(); toast('読み込みました');
        }
      }]
    });
  }

  /* ---------- 編集（Zetter の設定集画面に近い形） ---------- */

  /** サービスごとの上限。返信1回あたりの上限は Zeta では未確認なので null */
  var PLATFORMS = {
    zeta: { label: 'Zeta', entries: 50, body: 500, perReply: null, bodyTotal: null },
    zetter: { label: 'Zetter', entries: 50, body: 1000, perReply: 5, bodyTotal: 5000 }
  };
  function limitsFor(lb) { return PLATFORMS[(lb && lb.platform) || 'zeta'] || PLATFORMS.zeta; }
  var LIMITS = PLATFORMS.zeta;
  var openEntryIds = {};

  function entryHeading(e) { return (e.no ? e.no + '｜' : '') + (e.title || ''); }
  function splitKwField(raw) {
    var out = [];
    String(raw || '').split(/[、,，]+/).forEach(function (k) {
      k = k.trim();
      if (k && out.indexOf(k) === -1) out.push(k);
    });
    return out;
  }
  function bodyLen(s) { return Array.from(String(s || '')).length; }

  /** 照合タブなどの「＋項目を登録」：今のロアブックの編集画面を開き、空の項目を足す */
  function openEditorNewEntry() {
    var lb = activeLb();
    if (!lb) lb = createLorebook();
    addEntry(lb);
    state.editingId = lb.id;
    state.tab = 'manage';
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === 'manage')); });
    save(); renderView();
    focusEntry(lb.entries[lb.entries.length - 1]);
  }

  function createLorebook() {
    var now = new Date().toISOString();
    var lb = { id: P.uid('lb'), name: '新しいロアブック', version: 'v0.1', platform: 'zeta', notes: '', entries: [], createdAt: now, updatedAt: now };
    state.lorebooks.push(lb);
    state.activeId = lb.id;
    return lb;
  }

  function addEntry(lb) {
    var last = lb.entries[lb.entries.length - 1];
    var no = '';
    if (last && last.no) {
      var m = last.no.match(/^(.*?)(\d+)$/);
      if (m) no = m[1] + String(+m[2] + 1).padStart(m[2].length, '0');
    } else if (!last) no = '01';
    var e = { id: P.uid('e'), no: no, title: '', category: last ? last.category : '', keywords: [], body: '' };
    lb.entries.push(e);
    openEntryIds[e.id] = true;
    lb.updatedAt = new Date().toISOString();
    return e;
  }

  function focusEntry(e) {
    if (!e) return;
    var box = document.querySelector('.entry-edit[data-id="' + cssEsc(e.id) + '"]');
    if (!box) return;
    box.scrollIntoView({ block: 'center' });
    var inp = $('[data-f="heading"]', box);
    if (inp) inp.focus({ preventScroll: true });
  }

  function viewEditor(lb) {
    LIMITS = limitsFor(lb);
    view.innerHTML =
      '<section class="panel editor-head">' +
        '<div class="row"><button class="btn small" type="button" id="ed-back">← 一覧へ</button><span class="spacer"></span>' +
        '<button class="btn small primary" type="button" id="ed-test">発火テスト</button></div>' +
        '<div class="grid-2"><label class="field"><span class="field-label">ロアブック名</span><input type="text" id="ed-name"></label>' +
        '<label class="field"><span class="field-label">バージョン</span><input type="text" id="ed-ver"></label></div>' +
        '<div class="field"><span class="field-label">登録先のサービス（上限の表示に使います）</span><div class="seg" id="ed-platform">' +
          Object.keys(PLATFORMS).map(function (k) { return '<button type="button" data-v="' + k + '" aria-pressed="' + (limitsFor(lb) === PLATFORMS[k]) + '">' + PLATFORMS[k].label + '</button>'; }).join('') +
        '</div></div>' +
        '<div class="row"><p class="hint" id="ed-limit-hint">' + limitHint(lb) + '</p>' +
        '<span class="spacer"></span><span class="mono" id="ed-count"></span></div>' +
        '<div id="ed-warn"></div>' +
      '</section>' +
      '<div class="list" id="ed-list"></div>' +
      '<button class="btn add-entry" type="button" id="ed-add">＋ 項目を追加</button>';
    $('#ed-name').value = lb.name;
    $('#ed-ver').value = lb.version || '';
    $('#ed-name').addEventListener('input', function (e) { lb.name = e.target.value; touch(lb); renderPicker(); });
    $('#ed-ver').addEventListener('input', function (e) { lb.version = e.target.value; touch(lb); renderPicker(); });
    $('#ed-back').addEventListener('click', function () { state.editingId = null; save(); renderView(); window.scrollTo(0, 0); });
    $('#ed-test').addEventListener('click', function () { fireTestSheet(lb); });
    segToggle($('#ed-platform'), function (v) {
      lb.platform = v; LIMITS = limitsFor(lb);
      $('#ed-limit-hint').innerHTML = limitHint(lb);
      touch(lb); renderEditorList(lb);
    });
    $('#ed-add').addEventListener('click', function () {
      if (lb.entries.length >= LIMITS.entries) { toast('項目は' + LIMITS.entries + '件までです'); return; }
      var e = addEntry(lb);
      touch(lb); renderEditorList(lb); focusEntry(e);
    });
    renderEditorList(lb);
  }

  function limitHint(lb) {
    var L = limitsFor(lb);
    return esc(L.label + '：項目は最大' + L.entries + '件・本文は1項目' + L.body.toLocaleString() + '字まで' +
      (L.perReply ? '・返信1回につき最大' + L.perReply + '項目／本文合計' + L.bodyTotal.toLocaleString() + '字' : '') + '。変更は自動で保存されます。');
  }

  function touch(lb) { lb.updatedAt = new Date().toISOString(); save(); renderEditorWarnings(lb); }

  function renderEditorWarnings(lb) {
    LIMITS = limitsFor(lb);
    var c = $('#ed-count');
    if (c) {
      c.textContent = lb.entries.length + '/' + LIMITS.entries;
      c.style.color = lb.entries.length > LIMITS.entries ? 'var(--fp-ink)' : '';
    }
    var add = $('#ed-add');
    if (add) add.disabled = lb.entries.length >= LIMITS.entries;
    var el = $('#ed-warn');
    if (!el) return;
    var w = P.validate(lb.entries).filter(function (x) { return !/本文が空/.test(x.message); });
    lb.entries.forEach(function (e) {
      var n = bodyLen(e.body);
      if (n > LIMITS.body) w.push({ message: entryHeading(e) + '：本文が' + n + '字あります（' + LIMITS.body + '字まで）' });
    });
    if (lb.entries.length > LIMITS.entries) w.push({ message: '項目が' + lb.entries.length + '件あります（' + LIMITS.entries + '件まで）' });
    el.innerHTML = w.length ? '<div class="notice"><b>注意 ' + w.length + '件</b><br>' + w.map(function (x) { return esc(x.message); }).join('<br>') + '</div>' : '';
  }

  function kwPreviewHTML(kws) {
    return kws.map(function (k, i) {
      return '<span class="chip ' + (i < M.MAX_KEYWORDS ? 'kw' : 'off') + '">' + esc(k) + (Array.from(k).length === 1 ? '<span class="n">1文字</span>' : '') + '</span>';
    }).join('') + (kws.length > M.MAX_KEYWORDS ? '<span class="pill fp">6個目以降は使われません</span>' : '');
  }

  var ICON_UP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
  var ICON_DOWN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var ICON_TRASH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';

  function renderEditorList(lb) {
    var list = $('#ed-list');
    if (!lb.entries.length) {
      list.innerHTML = '<section class="panel"><p class="empty">項目がありません。下の「＋ 項目を追加」から作れます。</p></section>';
      renderEditorWarnings(lb);
      bindEditorList(lb, list);
      return;
    }
    list.innerHTML = lb.entries.map(function (e, i) {
      var kws = e.keywords || [];
      var n = bodyLen(e.body);
      return '<details class="entry-edit" data-id="' + esc(e.id) + '"' + (openEntryIds[e.id] ? ' open' : '') + '>' +
        '<summary>' +
          '<span class="ee-title" data-sum-title>' + esc(entryHeading(e) || '（項目名なし）') + '</span>' +
          '<span class="ee-kw mono" data-sum-kw>' + Math.min(kws.length, M.MAX_KEYWORDS) + '/' + M.MAX_KEYWORDS + '</span>' +
          '<span class="ee-tools">' +
            '<button class="icon-btn" type="button" data-up aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>' + ICON_UP + '</button>' +
            '<button class="icon-btn" type="button" data-down aria-label="下へ"' + (i === lb.entries.length - 1 ? ' disabled' : '') + '>' + ICON_DOWN + '</button>' +
            '<button class="icon-btn danger" type="button" data-del-entry aria-label="削除">' + ICON_TRASH + '</button>' +
          '</span>' +
        '</summary>' +
        '<div class="fold-body">' +
          '<label class="field"><span class="field-label">項目名</span><input type="text" data-f="heading" id="hd-' + esc(e.id) + '" placeholder="例：A01｜繁殖期と発情周期"></label>' +
          '<label class="field"><span class="field-label">キーワード（1〜5個。「、」「,」「，」で区切る）</span><input type="text" data-f="kw" id="kw-' + esc(e.id) + '" placeholder="例：発情、繁殖期、ヒート"></label>' +
          '<div class="chips" data-kw-preview>' + kwPreviewHTML(kws) + '</div>' +
          '<label class="field"><span class="field-label">本文</span><textarea data-f="body" id="body-' + esc(e.id) + '" rows="5"></textarea></label>' +
          '<div class="row end"><span class="mono meta" data-body-count' + (n > LIMITS.body ? ' style="color:var(--fp-ink)"' : '') + '>' + n + '/' + LIMITS.body + '字</span></div>' +
        '</div></details>';
    }).join('');
    lb.entries.forEach(function (e) {
      var box = list.querySelector('[data-id="' + cssEsc(e.id) + '"]');
      $('[data-f="heading"]', box).value = entryHeading(e);
      $('[data-f="kw"]', box).value = (e.keywords || []).join('、');
      $('[data-f="body"]', box).value = e.body || '';
    });
    autosizeAll(list);
    renderEditorWarnings(lb);
    bindEditorList(lb, list);
  }

  function bindEditorList(lb, list) {
    list.ontoggle = null;
    list.addEventListener('toggle', function (ev) {
      var box = ev.target;
      if (box.classList && box.classList.contains('entry-edit')) {
        if (box.open) { openEntryIds[box.dataset.id] = true; autosizeAll(box); } else delete openEntryIds[box.dataset.id];
      }
    }, true);
    list.oninput = function (ev) {
      var box = ev.target.closest('.entry-edit');
      if (!box) return;
      var e = lb.entries.find(function (x) { return x.id === box.dataset.id; });
      var f = ev.target.dataset.f;
      if (!e || !f) return;
      if (f === 'heading') {
        var h = P.splitHeading(ev.target.value);
        e.no = h.no; e.title = h.title;
        $('[data-sum-title]', box).textContent = entryHeading(e) || '（項目名なし）';
      } else if (f === 'kw') {
        e.keywords = splitKwField(ev.target.value);
        $('[data-kw-preview]', box).innerHTML = kwPreviewHTML(e.keywords);
        $('[data-sum-kw]', box).textContent = Math.min(e.keywords.length, M.MAX_KEYWORDS) + '/' + M.MAX_KEYWORDS;
      } else if (f === 'body') {
        e.body = ev.target.value;
        var n = bodyLen(e.body);
        var cnt = $('[data-body-count]', box);
        cnt.textContent = n + '/' + LIMITS.body + '字';
        cnt.style.color = n > LIMITS.body ? 'var(--fp-ink)' : '';
      }
      touch(lb);
    };
    list.onclick = function (ev) {
      var box = ev.target.closest('.entry-edit');
      if (!box) return;
      var btn = ev.target.closest('[data-up],[data-down],[data-del-entry]');
      if (!btn) return;
      ev.preventDefault();  // summary 内のボタンで開閉しないように
      var idx = lb.entries.findIndex(function (x) { return x.id === box.dataset.id; });
      if (btn.hasAttribute('data-up') || btn.hasAttribute('data-down')) {
        var j = idx + (btn.hasAttribute('data-up') ? -1 : 1);
        if (j < 0 || j >= lb.entries.length) return;
        var t = lb.entries[idx]; lb.entries[idx] = lb.entries[j]; lb.entries[j] = t;
        touch(lb); renderEditorList(lb);
        return;
      }
      var e = lb.entries[idx];
      confirmSheet('項目を削除', '「' + (entryHeading(e) || '項目名なし') + '」を削除します。', '削除する', function () {
        lb.entries.splice(idx, 1);
        touch(lb); renderEditorList(lb);
      });
    };
  }

  /** 発火テスト：例文を入れると、各項目の一致／不一致をその場で出す */
  function fireTestSheet(lb) {
    var s = sheet({
      title: '発火テスト',
      focus: false,
      html: '<p class="hint">今の下書きで、例文に一致する項目を確認します。文字列の部分一致のみで判定します。</p>' +
        '<label class="field"><span class="field-label">例文</span><textarea id="ft-text" placeholder="例：彼は手を伸ばした"></textarea></label>' +
        '<div id="ft-out" class="list"></div>'
    });
    var ta = $('#ft-text', s.el), out = $('#ft-out', s.el);
    ta.value = state.fireTestText || '';
    function run() {
      state.fireTestText = ta.value; save();
      out.innerHTML = fireTestHTML(ta.value, lb);
      autosize(ta);
    }
    ta.addEventListener('input', debounce(run, 120));
    run();
  }

  function fireTestHTML(text, lb) {
    if (!text.trim()) return '<p class="empty">例文を入れると、ここに結果が出ます。</p>';
    var r = M.analyze(text, lb.entries);
    var hitById = {};
    r.matched.forEach(function (m) { hitById[m.entry.id] = m; });
    var html = '<div class="highlight">' + highlightHTML(text, r.occurrences, M.nearMisses(text, lb.entries), lb.entries) + '</div>';
    LIMITS = limitsFor(lb);
    html += replyLimitNotice(r.matched, lb);
    html += '<p><b>' + (r.matched.length ? r.matched.length + '項目が一致' : '一致する項目はありません') + '</b></p>';
    lb.entries.forEach(function (e) {
      var m = hitById[e.id];
      html += '<div class="ft-row ' + (m ? 'on' : '') + '"><div class="row"><b>' + esc(entryHeading(e) || '（項目名なし）') + '</b>' +
        '<span class="pill ' + (m ? 'ok' : 'neutral') + '">' + (m ? '一致' : '不一致') + '</span></div>' +
        (m ? '<div class="chips">' + m.hits.map(function (h) { return '<span class="chip kw">' + esc(h.keyword) + '<span class="n">×' + h.count + '</span></span>'; }).join('') + '</div>'
           : '<span class="meta">例文に一致するキーワードがありません</span>') + '</div>';
    });
    return html;
  }

  /** Zetter の「返信1回につき最大5項目・本文合計5,000字」を超えそうなときの注意 */
  function replyLimitNotice(matched, lb) {
    var L = limitsFor(lb);
    if (!L.perReply) return '';
    var total = matched.reduce(function (n, m) { return n + bodyLen(m.entry.body); }, 0);
    var msgs = [];
    if (matched.length > L.perReply) msgs.push(matched.length + '項目が一致しています。' + L.label + 'では返信1回につき最大' + L.perReply + '項目まで使われるため、どれかは使われません（どの項目が優先されるかは未確認）。');
    if (total > L.bodyTotal) msgs.push('一致した項目の本文が合計' + total.toLocaleString() + '字あります（' + L.label + 'では合計' + L.bodyTotal.toLocaleString() + '字まで）。');
    return msgs.length ? '<div class="notice" style="background:var(--warn-bg);color:var(--warn-ink)">' + msgs.map(esc).join('<br>') + '</div>' : '';
  }

  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* ================= 使い方 ================= */

  function welcomePanel() {
    if (state.guideSeen) return '';
    return '<section class="panel" style="background:var(--accent-soft);border-color:transparent">' +
      '<h2>はじめに</h2>' +
      '<p>ロアブックのキーワードが、会話文のどこに一致するかを確かめる道具です。Zetaに登録する前の下書きでも使えます。</p>' +
      '<ol class="steps"><li><b>項目を登録</b>：項目名・キーワード・本文を入れる（発火テストもその場でできる）</li><li><b>文章を貼る</b>：この画面に会話文を入れると、一致した所が黄色になる</li><li><b>弱点を見る</b>：監査タブの「設計点検」で誤発火しやすい語を確認</li></ol>' +
      '<div class="row"><button class="btn small primary" type="button" data-action="quick-add">項目を登録する</button><button class="btn small" type="button" data-action="open-guide">使い方をくわしく</button>' +
      '<span class="spacer"></span><button class="btn small ghost" type="button" data-action="dismiss-welcome">閉じる</button></div></section>';
  }

  function guideSheet() {
    var g = [
      ['このツールでできること',
        '<p>登録したキーワードが、文章のどこに<b>文字列として</b>一致するかを調べます。Zetaもロアブックの登録も不要で、下書きの段階から使えます。</p>' +
        '<p class="hint">分かるのは「どの項目が呼ばれそうか（発火候補）」までです。呼ばれたあとAIが本文どおりに描写するかは、Zetaの実機で試す必要があります。</p>'],
      ['1. 項目を登録する',
        '<p>管理タブの「<b>＋新しいロアブック</b>」か各ロアブックの「編集」で、項目名・キーワード・本文を入れます。キーワードは「、」「,」「，」で区切ります（最大5個）。画面上の「<b>発火テスト</b>」で、例文を入れてすぐ一致を確かめられます。</p>' +
        '<p>AIが作ったロアブックは、管理タブの「貼り付け」に Markdown をそのまま貼れば、まとめて読み込めます。</p>'],
      ['2. 照合：文章を貼って確かめる',
        '<p>「ユーザー発言」「AI生成文」の欄に文章を貼ると、一致した箇所が<span style="background:var(--mark)">黄色</span>になります。黄色をタップすると、どの項目のどのキーワードかが分かります。</p>' +
        '<p>試す文章は、自分で書いた数行、過去の会話ログ、AIに書かせたテスト会話のどれでも構いません。</p>' +
        '<p>一致箇所の「適切／不適切」を押すと、判断が記録に残ります。</p>'],
      ['3. 監査：弱点を見つける',
        '<p><b>設計点検</b>：文章なしで、キーワードそのものを点検します。1文字のキーワードや、日常語に紛れ込む語（例：手→上手・手紙）が一覧になります。下の語彙リストに語を足すと、点検の範囲が広がります。</p>' +
        '<p><b>監査ケース</b>：「この文では一致してほしい／ほしくない」を登録しておくと、外れたものが<span class="pill fp">誤発火候補</span><span class="pill miss">拾い漏れ</span>として出ます。</p>' +
        '<p><b>手動の記録</b>：照合タブで押した判断の一覧です。</p>'],
      ['4. 比較：直す前と後を比べる',
        '<p>管理タブで「複製」して新版を作り、キーワードを直してから、比較タブで同じ文を照合します。直したことで拾えなくなった項目も分かります。</p>'],
      ['5. 連動：ターンの流れを見る',
        '<p>会話を1ターンずつ入れると、各AI生成に影響しうる項目を時系列で並べます。一致した項目は次のAI生成1回に効く、という前提で表示します。</p>'],
      ['ことば',
        '<p><b>発火候補</b>：キーワードが文字列として一致した項目</p>' +
        '<p><b>誤発火</b>：一致したが、場面としては呼ばれてほしくない（例：斬→斬新）</p>' +
        '<p><b>拾い漏れ</b>：呼ばれてほしいのに一致しない（例：「目が合」では「目を合わせ」を拾えない）</p>' +
        '<p><b>表記ゆれ</b>：ひらがな・カタカナ・全角半角の違い。実機では変換されないので、別の語として扱います</p>'],
      ['データについて',
        '<p>入力した内容は、このブラウザの中だけに保存されます。外部へは送信しません。スマホとPCでは別々に保存されるので、移すときは管理タブの「すべて書き出す」を使ってください。</p>']
    ];
    sheet({
      title: '使い方',
      focus: false,
      html: g.map(function (x, i) {
        return '<details class="fold"' + (i < 2 ? ' open' : '') + '><summary>' + esc(x[0]) + '</summary><div class="fold-body guide">' + x[1] + '</div></details>';
      }).join('')
    });
  }

  /* ================= 起動 ================= */

  function addSample() {
    var lb = sampleLorebook();
    state.lorebooks.push(lb);
    state.activeId = lb.id;
    if (!lbById(state.compareOldId)) state.compareOldId = lb.id;
    if (!lbById(state.compareNewId)) state.compareNewId = lb.id;
    save(); renderView();
    toast('サンプル v0.3 を追加しました');
  }

  function boot() {
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
    $('#active-lb').addEventListener('change', function (e) { state.activeId = e.target.value; save(); renderView(); });
    // 画面をまたいで使うボタン
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'add-sample') addSample();
      if (a.dataset.action === 'goto-manage') setTab('manage');
      if (a.dataset.action === 'dup-active') { duplicateLb(activeLb()); renderView(); }
      if (a.dataset.action === 'quick-add') openEditorNewEntry();
      if (a.dataset.action === 'new-lb') { createLorebook(); addEntry(activeLb()); state.editingId = state.activeId; save(); renderView(); focusEntry(activeLb().entries[0]); }
      if (a.dataset.action === 'open-guide') guideSheet();
      if (a.dataset.action === 'dismiss-welcome') { state.guideSeen = true; save(); var w = a.closest('.panel'); if (w) w.remove(); }
    });
    view.addEventListener('click', function (e) {
      if (state.tab === 'sim') onSimClick(e);
      if (state.tab === 'chain') onTurnsClick(e);
    });
    view.addEventListener('input', function (e) { autosize(e.target); if (state.tab === 'chain') onTurnsInput(e); });

    var hashTab = (location.hash || '').replace('#', '');
    if (['sim', 'audit', 'compare', 'chain', 'manage'].indexOf(hashTab) !== -1) state.tab = hashTab;
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); });
    renderView();
    window.addEventListener('pagehide', saveNow);
  }

  boot();
})();
