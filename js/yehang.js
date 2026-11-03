/* 夜航 · 前端脚本：目录高亮、旧文提醒、Giscus 懒加载、站内搜索、友链头像兜底 */
(function () {
  'use strict';

  /* ---------- 目录当前章节高亮 ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc-rail .toc-list a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var pairs = tocLinks.map(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      return { li: a.parentElement, el: document.getElementById(id) };
    }).filter(function (p) { return p.el; });
    var setHere = function (target) {
      pairs.forEach(function (p) { p.li.classList.toggle('here', p.el === target); });
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setHere(e.target); });
    }, { rootMargin: '-90px 0px -65% 0px', threshold: 0 });
    pairs.forEach(function (p) { io.observe(p.el); });
  }

  /* ---------- 手机目录：点了就收起 ---------- */
  var tocMobile = document.querySelector('.toc-mobile');
  if (tocMobile) {
    tocMobile.addEventListener('click', function (e) {
      if (e.target.closest('a')) tocMobile.open = false;
    });
  }

  /* ---------- 旧文提醒 ---------- */
  var outdate = document.querySelector('.outdate');
  if (outdate) {
    var updated = Number(outdate.getAttribute('data-updated'));
    var limit = Number(outdate.getAttribute('data-limit')) || 730;
    var days = Math.floor((Date.now() - updated) / 86400000);
    if (days >= limit) {
      outdate.textContent = outdate.getAttribute('data-prev') + ' ' + days + ' ' + outdate.getAttribute('data-next');
      outdate.hidden = false;
    }
  }

  /* ---------- Giscus：滚动到附近再加载 ---------- */
  var slot = document.querySelector('[data-giscus]');
  if (slot) {
    var loadGiscus = function () {
      if (slot.dataset.loaded) return;
      slot.dataset.loaded = '1';
      var s = document.createElement('script');
      s.src = 'https://giscus.app/client.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      var attrs = {
        'data-repo': slot.dataset.repo,
        'data-repo-id': slot.dataset.repoId,
        'data-category-id': slot.dataset.categoryId,
        'data-mapping': slot.dataset.mapping,
        'data-strict': '0',
        'data-reactions-enabled': '1',
        'data-emit-metadata': '0',
        'data-input-position': 'bottom',
        'data-theme': slot.dataset.theme,
        'data-lang': slot.dataset.lang,
        'data-loading': 'lazy'
      };
      Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
      slot.appendChild(s);
      slot.classList.add('is-loaded');
    };
    if ('IntersectionObserver' in window) {
      var gio = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { gio.disconnect(); loadGiscus(); }
      }, { rootMargin: '600px 0px' });
      gio.observe(slot);
    } else {
      loadGiscus();
    }
  }

  /* ---------- 友链头像加载失败时兜底 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('img[data-fallback]'), function (img) {
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      img.src = img.getAttribute('data-fallback');
    });
  });

  /* ---------- 正文图片加载失败：显示说明文字，不留破图标 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.post-body img:not([data-fallback])'), function (img) {
    var fail = function () {
      var note = document.createElement('p');
      note.className = 'img-missing';
      var fig = img.closest('figure');
      var hasCaption = fig && fig.querySelector('figcaption');
      note.textContent = '图片暂时无法加载' + (img.alt && !hasCaption ? '：' + img.alt : '');
      img.replaceWith(note);
    };
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail();
    else img.addEventListener('error', fail, { once: true });
  });

  /* ---------- 站内搜索 ---------- */
  var dialog = document.getElementById('search');
  if (!dialog || typeof dialog.showModal !== 'function') {
    Array.prototype.forEach.call(document.querySelectorAll('[data-search-open]'), function (b) { b.hidden = true; });
    return;
  }
  var input = document.getElementById('search-input');
  var list = document.getElementById('search-results');
  var state = document.getElementById('search-state');
  var index = null;
  var loading = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    state.textContent = '正在载入索引……';
    loading = fetch(dialog.getAttribute('data-index'))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (xml) {
        var doc = new DOMParser().parseFromString(xml, 'application/xml');
        index = Array.prototype.map.call(doc.querySelectorAll('entry'), function (en) {
          var get = function (sel) { var n = en.querySelector(sel); return n ? n.textContent : ''; };
          var tmp = document.createElement('div');
          tmp.innerHTML = get('content');
          return { title: get('title').trim(), url: get('url').trim(), text: (tmp.textContent || '').replace(/\s+/g, ' ').trim() };
        });
        state.textContent = '输入关键词开始搜索。';
        return index;
      })
      .catch(function () {
        loading = null;
        state.textContent = '索引载入失败，请稍后再试，或去归档页按时间查找。';
        return null;
      });
    return loading;
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function mark(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      if (!w) return;
      var re = new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
    });
    return out;
  }

  function run() {
    var q = input.value.trim();
    list.innerHTML = '';
    if (!q) { state.textContent = '输入关键词开始搜索。'; return; }
    if (!index) return;
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = [];
    index.forEach(function (p) {
      var t = p.title.toLowerCase();
      var c = p.text.toLowerCase();
      var score = 0;
      var first = -1;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var inT = t.indexOf(w) !== -1;
        var at = c.indexOf(w);
        if (!inT && at === -1) return;
        score += (inT ? 10 : 0) + (at !== -1 ? 1 : 0);
        if (at !== -1 && (first === -1 || at < first)) first = at;
      }
      var snippet = '';
      if (first !== -1) {
        var start = Math.max(0, first - 30);
        snippet = (start ? '……' : '') + p.text.slice(start, start + 110) + (start + 110 < p.text.length ? '……' : '');
      } else {
        snippet = p.text.slice(0, 100) + (p.text.length > 100 ? '……' : '');
      }
      hits.push({ p: p, score: score, snippet: snippet });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    state.textContent = hits.length ? '找到 ' + hits.length + ' 篇。' : '没有找到包含「' + q + '」的文章，换个词试试。';
    list.innerHTML = hits.slice(0, 20).map(function (h) {
      return '<li><a href="' + esc(h.p.url) + '"><span class="t">' + mark(h.p.title, words) + '</span><span class="s">' + mark(h.snippet, words) + '</span></a></li>';
    }).join('');
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { loadIndex().then(run); }, 120);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); var a = list.querySelector('a'); if (a) a.click(); }
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function open() {
    dialog.showModal();
    input.focus();
    input.select();
    loadIndex().then(run);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-search-open]'), function (b) {
    b.addEventListener('click', open);
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === '/' && !dialog.open && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.target.isContentEditable) {
      e.preventDefault();
      open();
    }
  });
})();
