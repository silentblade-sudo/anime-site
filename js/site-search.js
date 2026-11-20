/* Строка поиска в шапке сайта: аниме и фильмы с подсказками.
 *
 * Разметка — пустой контейнер там, где должна стоять строка:
 *   <div data-site-search></div>                 — строка всегда видна (ширина — css/site-search.css)
 *   <div data-site-search="collapsible"></div>   — на узких экранах (до 1150px) вместо строки кнопка-лупа,
 *                                                  строка открывается панелью под шапкой
 * Подключение (после css/site-search.css):
 *   <script src="js/anime-search.js"></script> <script src="js/site-search.js"></script>   — с главной
 *   <script src="../js/anime-search.js"></script> <script src="../js/site-search.js"></script> — из pages/
 *
 * Поиск — js/anime-search.js (данные грузятся при первом вводе). Клавиатура: ↓/↑ — по подсказкам,
 * Enter — открыть выбранную (или первую), Escape — закрыть подсказки / панель. Клик вне блока закрывает.
 */
(function () {
  'use strict';

  var LIMIT = 8;
  var COMPACT_QUERY = '(max-width: 1150px)';
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  var uid = 0;

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M20 20l-4.2-4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function engine() {
    if (window.AnimeSearch) return window.AnimeSearch.load();
    // страница не подключила движок — подключаем сами (путь от этого скрипта)
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = new URL('anime-search.js', SCRIPT_SRC).href;
      s.onload = function () { window.AnimeSearch ? resolve() : reject(new Error('AnimeSearch не найден')); };
      s.onerror = function () { reject(new Error('anime-search.js не загрузился')); };
      document.head.appendChild(s);
    }).then(function () { return window.AnimeSearch.load(); });
  }

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function setup(host) {
    var n = ++uid;
    var collapsible = host.getAttribute('data-site-search') === 'collapsible';
    var compactMq = collapsible && window.matchMedia ? window.matchMedia(COMPACT_QUERY) : null;

    var root = mk('div', 'site-search' + (collapsible ? ' site-search--collapsible' : ''));
    root.setAttribute('role', 'search');

    var toggle = mk('button', 'site-search-toggle');
    toggle.type = 'button';
    toggle.innerHTML = ICON;
    toggle.setAttribute('aria-label', 'Открыть поиск');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'site-search-panel-' + n);

    var panel = mk('div', 'site-search-panel');
    panel.id = 'site-search-panel-' + n;

    var field = mk('div', 'site-search-field');
    var icon = mk('span', 'site-search-icon');
    icon.innerHTML = ICON;
    var input = mk('input', 'site-search-input');
    input.type = 'search';
    input.placeholder = 'Поиск аниме и фильмов';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Поиск аниме и фильмов по названию');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'site-search-list-' + n);
    field.append(icon, input);

    var dropdown = mk('div', 'site-search-dropdown');
    dropdown.hidden = true;
    var status = mk('p', 'site-search-status');
    status.setAttribute('aria-live', 'polite');
    var list = mk('ul', 'site-search-list');
    list.id = 'site-search-list-' + n;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Подсказки поиска');
    dropdown.append(status, list);

    panel.append(field, dropdown);
    root.append(toggle, panel);
    host.replaceWith(root);

    var results = [];
    var active = -1;
    var timer = null;
    var query = '';

    function isCompact() { return !!(compactMq && compactMq.matches); }

    function setActive(i) {
      var options = list.querySelectorAll('[role="option"]');
      active = i;
      Array.prototype.forEach.call(options, function (o, k) { o.setAttribute('aria-selected', String(k === i)); });
      if (i >= 0 && options[i]) {
        input.setAttribute('aria-activedescendant', options[i].id);
        options[i].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function closeList() {
      dropdown.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      setActive(-1);
    }

    function render(found) {
      results = found;
      list.replaceChildren();
      active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!found.length) {
        status.textContent = 'Ничего не найдено';
        status.hidden = false;
      } else {
        status.textContent = '';
        status.hidden = true;
      }
      found.forEach(function (r, i) {
        var li = mk('li');
        li.id = 'site-search-opt-' + n + '-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        var a = mk('a', 'site-search-option');
        a.href = r.href;
        a.tabIndex = -1; // фокус остаётся в поле, выбор — стрелками
        a.appendChild(mk('span', 'site-search-option-title', r.title));
        var meta = mk('span', 'site-search-option-meta');
        meta.appendChild(mk('span', 'site-search-option-section' + (r.type === 'movie' ? ' is-movie' : ''), r.section));
        if (r.extra) meta.appendChild(document.createTextNode(' · ' + r.extra));
        a.appendChild(meta);
        li.appendChild(a);
        li.addEventListener('mousemove', function () { if (active !== i) setActive(i); });
        list.appendChild(li);
      });
      dropdown.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function update() {
      var raw = input.value;
      var q = window.AnimeSearch ? window.AnimeSearch.normalize(raw) : raw.trim().toLowerCase();
      query = q;
      if (q.length < 2) {
        results = [];
        list.replaceChildren();
        if (q.length === 1) {
          status.textContent = 'Введите хотя бы 2 буквы';
          status.hidden = false;
          dropdown.hidden = false;
        } else {
          closeList();
        }
        return;
      }
      status.textContent = 'Ищем…';
      status.hidden = false;
      list.replaceChildren();
      dropdown.hidden = false;
      engine().then(function (search) {
        if (query !== q) return; // пока грузили, запрос поменялся
        render(search.find(q, { limit: LIMIT }));
      }).catch(function () {
        if (query !== q) return;
        results = [];
        status.textContent = 'Не удалось загрузить каталог. Попробуйте ещё раз.';
        status.hidden = false;
      });
    }

    function go(i) {
      var r = results[i];
      if (r) location.href = r.href;
    }

    function openPanel() {
      // меню под бургером и панель поиска не открываем одновременно
      var hdr = root.closest('header');
      if (hdr && hdr.classList.contains('nav-open')) {
        var burger = hdr.querySelector('.burger');
        if (burger) burger.click();
      }
      root.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Закрыть поиск');
      // панель — под шапкой (фиксированная, поэтому считаем отступ от низа шапки)
      var header = root.closest('header');
      var bottom = header ? header.getBoundingClientRect().bottom : toggle.getBoundingClientRect().bottom;
      panel.style.top = Math.max(0, Math.round(bottom)) + 'px';
      input.focus();
    }

    function closePanel(returnFocus) {
      if (!root.classList.contains('is-open')) return;
      root.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Открыть поиск');
      panel.style.top = '';
      closeList();
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (root.classList.contains('is-open')) closePanel(true); else openPanel();
    });

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(update, 130);
    });
    input.addEventListener('focus', function () {
      root.classList.add('is-focused');
      if (results.length && input.value.trim()) { dropdown.hidden = false; input.setAttribute('aria-expanded', 'true'); }
    });
    input.addEventListener('blur', function () { root.classList.remove('is-focused'); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        if (dropdown.hidden) { dropdown.hidden = false; input.setAttribute('aria-expanded', 'true'); }
        var next = e.key === 'ArrowDown' ? active + 1 : active - 1;
        if (next >= results.length) next = 0;
        if (next < -1) next = results.length - 1;
        setActive(next);
      } else if (e.key === 'Enter') {
        // Enter до того, как подсказки пришли, — дождёмся и откроем первую
        e.preventDefault();
        if (results.length && !dropdown.hidden) { go(active >= 0 ? active : 0); return; }
        var q = window.AnimeSearch ? window.AnimeSearch.normalize(input.value) : input.value.trim();
        if (q.length >= 2) engine().then(function (s) { var f = s.find(q, { limit: 1 }); if (f[0]) location.href = f[0].href; else update(); });
      } else if (e.key === 'Escape') {
        if (!dropdown.hidden) { e.preventDefault(); closeList(); }
        else if (root.classList.contains('is-open')) { e.preventDefault(); closePanel(true); }
        else if (input.value) { e.preventDefault(); input.value = ''; }
      }
    });

    // клик вне блока — закрываем подсказки (и панель на узком экране)
    document.addEventListener('pointerdown', function (e) {
      if (root.contains(e.target)) return;
      closeList();
      if (root.classList.contains('is-open')) closePanel(false);
    });
    // открыли меню-бургер — прячем панель поиска
    var hostHeader = root.closest('header');
    var burgerBtn = hostHeader && hostHeader.querySelector('.burger');
    if (burgerBtn) burgerBtn.addEventListener('click', function () { closePanel(false); });
    // если ширина выросла — панель узкого экрана больше не нужна
    if (compactMq) {
      var onChange = function () { if (!isCompact()) closePanel(false); };
      if (compactMq.addEventListener) compactMq.addEventListener('change', onChange);
      else if (compactMq.addListener) compactMq.addListener(onChange);
    }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-site-search]'), setup);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
